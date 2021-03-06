/*******************************************************************************
#      ____               __          __  _      _____ _       _               #
#     / __ \              \ \        / / | |    / ____| |     | |              #
#    | |  | |_ __   ___ _ __ \  /\  / /__| |__ | |  __| | ___ | |__   ___      #
#    | |  | | '_ \ / _ \ '_ \ \/  \/ / _ \ '_ \| | |_ | |/ _ \| '_ \ / _ \     #
#    | |__| | |_) |  __/ | | \  /\  /  __/ |_) | |__| | | (_) | |_) |  __/     #
#     \____/| .__/ \___|_| |_|\/  \/ \___|_.__/ \_____|_|\___/|_.__/ \___|     #
#           | |                                                                #
#           |_|                 _____ _____  _  __                             #
#                              / ____|  __ \| |/ /                             #
#                             | (___ | |  | | ' /                              #
#                              \___ \| |  | |  <                               #
#                              ____) | |__| | . \                              #
#                             |_____/|_____/|_|\_\                             #
#                                                                              #
#                              (c) 2010-2011 by                                #
#           University of Applied Sciences Northwestern Switzerland            #
#                     Institute of Geomatics Engineering                       #
#                           martin.christen@fhnw.ch                            #
********************************************************************************
*     Licensed under MIT License. Read the file LICENSE for more information   *
*******************************************************************************/

goog.provide('owg.Surface');

goog.require('goog.debug.Logger');
goog.require('goog.json');
goog.require('owg.AABB');
goog.require('owg.TriangleIntersector');
goog.require('owg.mat4');
goog.require('owg.vec3');
goog.require('owg.vec4');

/**
 * @typedef {{
 *     BoundingBox: Array.<number>,
 *     CurtainIndex: number,
 *     IndexSemantic: string,
 *     Indices: Array.<number>,
 *     Offset: number,
 *     VertexSemantic: string,
 *     Vertices: Array.<number>
 * }}
 */
var ObjectJSON;

//------------------------------------------------------------------------------
/** 
 * @class surface 
 * Represents a Surface Object.
 * 
 * {@link http://www.openwebglobe.org} 
 *
 * @author Benjamin Loesch benjamin.loesch@fhnw.ch 
 * @author Martin Christen martin.christen@fhnw.ch
 */
//------------------------------------------------------------------------------
/*
 One Surface supports one vertex buffer, one index buffer and one texture
 The following semanic is used for vertices:
 
 P: Position
 N: Normal
 T: Texture
 C: Color

 Currently the following vertex semantics are supported:
    P:    Position only
    PNT:  Position, Normal, Texcoord
    PC:   Position, Color
    PT:   Position, Texcoord
    PNCT: Position, Normal, Color, Texcoord

 For Indices the following semantics are used:
 
 "TRIANGLE" for triangles rendering
 "LINE" for line rendering
 "POINT" for point rendering

example:

 // Example 1: manual generation of a Surface

 mySurface = new Surface(engine);
 mySurface.SetBufferP([0,0,0,   1,0,0,   1,1,0,]);
 mySurface.SetIndexBuffer([0,1,2], "TRIANGLES");
 
 // Example 2: load from JSON
 
 mySurface = new Surface(engine);
 mySurface.loadFromJSON("myGeometry.json");
 
*/
//------------------------------------------------------------------------------
/**
 * Create a new Surface Object
 * This is the Surface class
 * @param {engine3d} engine the 3d engine. 
 * @constructor
 */
function Surface(engine)
{
   /** @type {engine3d} */
   this.engine = engine;
   /** @type {WebGLRenderingContext} */
   this.gl = engine.gl;
   
   /** @type {WebGLBuffer} */
   this.vbo = null;              // vertex buffer (WebGL)
   /** @type {WebGLBuffer} */
   this.ibo = null;              // index buffer  (WebGL)
   
   /** @type {?Texture} */
   this.texture = null;          // Texture (texture class)
   
   /** @type {?Float32Array} */
   this.vertexbufferdata = null; // interleaved vertex buffer data
   /** @type {string} */
   this.mode = "";               // vertex semantic
   /** @type {number} */
   this.numvertex = 0;           // number of vertices
   /** @type {number} */
   this.numindex = 0;            // number of elements of index vector
   
   /** @type ?Uint16Array*/
   this.indexbufferdata = null;  // Uint16Array(indices)
   /** @type {?string} */
   this.indexsemantic = null;    // triangle, line, or point.
  
   /** @type {boolean} */
   this.Ready = false;           // Ready to draw
   this.http = null;
   /** @type {?string} */
   this.jsonUrl = null;
   /** @type {?function()} */
   this.cbfJSONLoad = null;
   
   this.defaultfontcolor = new vec4();
   this.defaultfontcolor.Set(1,1,1,1);
   
   this.defaultpoicolor = new vec4();
   this.defaultpoicolor.Set(1,1,1,1);
   
   
   this.intersector = new TriangleIntersector();
   
   /** @type {?Array.<number>} */
   this.bbmin = null;
   /** @type {?Array.<number>} */
   this.bbmax = null;
   /** @type {?Array} */
   this.offset = null;
   /** @type {?number} */
   this.curtainindex = null;
   
   
   this.aabb = new AABB();
   
   /** @type {?mat4} */
   this.modelMatrix = null;
   /** @type {number} */
   this.vertexLength = 0; //number of entries in the vertexbufferdata array per vertex
     
   /** @type {number} */
   this.numOfTriangles = 0;     //number of triangles depends on indexsemantic "TRIANGLES or TRIANGLESTRIP"
   
   this.currentTriangle = {}; //current triangle used for intersection tests.
   this.billboardPos = new Array(3);
   this.billboardCenterTrans = new Array(3);
   this.newModelMatrix = new mat4();
   
   this.manageTexture = false; // is set to true if the destrox function has to destroy this texture.

   
}


//------------------------------------------------------------------------------
/**
 * @description Specify a buffer with the vertex semantic "p"
 * @param {Array|Float32Array} p the points.
 */
Surface.prototype.SetBufferP = function(p)
{
   if ((p.length % 3) == 0)
   {
      this.vertexbufferdata = new Float32Array(p);
      this.mode = "p";
      this.vertexLength = 3;
   }
}

//------------------------------------------------------------------------------
/**
 * @description Specify a buffer with the vertex semantic "pnt"
 * @param {Array|Float32Array} pnt the point,normal,texture-coordinates array.
 */
Surface.prototype.SetBufferPNT = function(pnt)
{
   if ((pnt.length % 8) == 0)
   {
      this.vertexbufferdata = new Float32Array(pnt);
      this.mode = "pnt";
      this.vertexLength = 8;
   }
}

//------------------------------------------------------------------------------
/**
 * @description Specify a buffer with the vertex semantic "pc"
 * @param {Array|Float32Array} pc the point,color array.
 */
Surface.prototype.SetBufferPC = function(pc)
{
   if ((pc.length % 7) == 0)
   {
      this.vertexbufferdata = new Float32Array(pc);
      this.mode = "pc";
      this.vertexLength = 7;
   }
}

//------------------------------------------------------------------------------
/**
 * @description Specify a buffer with the vertex semantic "pt"
 * @param {Array|Float32Array} pt the point,texture-coordinates array.
 */
Surface.prototype.SetBufferPT = function(pt)
{
   if ((pt.length % 5) == 0)
   {
      this.vertexbufferdata = new Float32Array(pt);
      this.mode = "pt";
      this.vertexLength = 5;
   }
}

//------------------------------------------------------------------------------
/**
 * @description Specify a buffer with the vertex semantic "pnct"
 * @param {Array|Float32Array} pnct the point,normal,color texture-coordinates array.
 */
Surface.prototype.SetBufferPNCT = function(pnct)
{
   if ((pnct.length % 12) == 0)
   {
      this.vertexbufferdata = new Float32Array(pnct);
      this.mode = "pnct";
      this.vertexLength = 12;
   }
}

//------------------------------------------------------------------------------
/**
 * @description Specify a buffer with the vertex semantic "pt"
 * @param {Array|Float32Array} fontdata the point,texture-coordinates array.
 */
Surface.prototype.SetBufferFont= function(fontdata)
{
   if ((fontdata.length % 5) == 0)
   {
      this.vertexbufferdata = new Float32Array(fontdata);
      this.mode = "font";
      this.vertexLength = 5;
   }
}
//------------------------------------------------------------------------------
/**
 * @description Specify a buffer with the vertex semantic "poi"
 * @param {Array|Float32Array} poidata the point,texture-coordinates array.
 */
Surface.prototype.SetBufferPoi= function(poidata)
{
   if ((poidata.length % 5) == 0)
   {
      this.vertexbufferdata = new Float32Array(poidata);
      this.mode = "poi";
      this.vertexLength = 5;
   }
}
//------------------------------------------------------------------------------
/**
 * @description Specify a an index buffer with the specified index semantic
 * @param {Array} idx indices array.
 * @param {string} idxsem supports "TRIANGLES","POINTS" or "LINES".
 */
Surface.prototype.SetIndexBuffer = function(idx,idxsem)
{
   this.indexbufferdata = new Uint16Array(idx); 
   this.indexsemantic = idxsem;
   this.numindex = idx.length;
   this.Ready = true;
   
   //calculate the number of triangles
   switch(idxsem)
   {
      case "TRIANGLES"     :  this.numOfTriangles = idx.length/3;
                              break;
                           
      case "TRIANGLESTRIP" :  this.numOfTriangles = (idx.length-3)+1
       
      case "default"       :  break;
      
   }
   
}

//------------------------------------------------------------------------------
/**
 * @description Set Texture for this mesh
 * @param {Texture} tex This is the texture to set.
 */
Surface.prototype.SetTexture = function(tex)
{
   this.texture = tex; 
}
//------------------------------------------------------------------------------
/**
 * @description Create Buffers on GPU
 * @ignore
 */
Surface.prototype._ToGPU = function()
{
   //test vertexbufferdata ungleich null
   // Create VB
    this.vbo = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertexbufferdata, this.gl.STATIC_DRAW);
    
    // Create IB
    this.ibo = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, this.indexbufferdata, this.gl.STATIC_DRAW);
}



//------------------------------------------------------------------------------
/**
 * @description Free all memory, especially the GPU buffers.
 * @ignore
 */
Surface.prototype.Destroy = function()
{
   if (this.vbo)
   {
      this.gl.deleteBuffer(this.vbo);
      this.vbo = null;
   }
   
   if (this.ibo )
   {
      this.gl.deleteBuffer(this.ibo);
      this.ibo = null;
   }
   
   if(this.manageTexture)
   {
      this.texture.Destroy();
   }
   else
   {
      this.texture = null;   
   }  
   this.vertexbufferdata = null; 
   this.mode = ""; 
   this.numvertex = 0;         
   this.numindex = 0;
   this.indexbufferdata = null;
   this.indexsemantic = null;
}
var j=0;
//------------------------------------------------------------------------------
/**
 * @description Draws the Surface element. Ensure that "toGPU" is called before calling this method.
 * note: this method still needs some optimization
 * note: ranged draw must be supported soon
 * @param {boolean=} opt_ranged
 * @param {number=} opt_count
 * @param {number=} opt_offset
 * @param {vec4=} opt_fontcolor
 * @param {vec4=} opt_poicolor
 */
Surface.prototype.Draw = function(opt_ranged, opt_count, opt_offset, opt_fontcolor, opt_poicolor)
{
   if (!this.Ready)
   {
      return;  // not yet loaded
   }

   var count = opt_count || 0;
   var offset = opt_offset || 0;
   
   // this will be changed, but for now the draw function creates the GPU buffers.
   if (this.vbo == null)
   {
      this._ToGPU();
   }
   
   // setup interleaved VBO and IBO
   this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
   this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.ibo);
           
   if(this.modelMatrix)
   {     
      this.engine.PushMatrices();
      this.newModelMatrix.Multiply(this.modelMatrix,this.engine.matModel);
      this.engine.SetModelMatrix(this.newModelMatrix);   
   }  
         
   switch (this.mode) 
   {
       case "p":      this.gl.enableVertexAttribArray(0);
                      this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 8*4, 0*4); // position
                      break;
                       
       case "pnt": 
                      this.gl.enableVertexAttribArray(0);
                      this.gl.enableVertexAttribArray(1);
                      this.gl.enableVertexAttribArray(2);
                      this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 8*4, 0*4); // position
                      this.gl.vertexAttribPointer(1, 3, this.gl.FLOAT, false, 8*4, 3*4); // normal
                      this.gl.vertexAttribPointer(2, 2, this.gl.FLOAT, false, 8*4, 6*4); // texcoord
                      this.engine.shadermanager.UseShader_PNT(this.engine.matModelViewProjection);
                      break;
                        
        case "pc": 
                      this.gl.enableVertexAttribArray(0);
                      this.gl.enableVertexAttribArray(1);
                      this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 7*4, 0*4); // position
                      this.gl.vertexAttribPointer(1, 4, this.gl.FLOAT, false, 7*4, 3*4); // color
                      this.engine.shadermanager.UseShader_PC(this.engine.matModelViewProjection);
                      break;
                        
        case "pt": 
                      this.gl.enableVertexAttribArray(0);
                      this.gl.enableVertexAttribArray(1);
                      this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 5*4, 0*4); // position
                      this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 5*4, 3*4); // texture
                      this.engine.shadermanager.UseShader_PT(this.engine.matModelViewProjection);
                      break;
                        
        case "pnct": 
                      this.gl.enableVertexAttribArray(0);
                      this.gl.enableVertexAttribArray(1);
                      this.gl.enableVertexAttribArray(2);
                      this.gl.enableVertexAttribArray(3);
                      this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 12*4, 0*4); // position
                      this.gl.vertexAttribPointer(1, 3, this.gl.FLOAT, false, 12*4, 3*4); // normal
                      this.gl.vertexAttribPointer(2, 4, this.gl.FLOAT, false, 12*4, 6*4); // color
                      this.gl.vertexAttribPointer(3, 2, this.gl.FLOAT, false, 12*4, 10*4); // texture
                      this.engine.shadermanager.UseShader_PNCT(this.engine.matModelViewProjection);
                      break;
                      
        case "font": 
                      this.gl.enableVertexAttribArray(0);
                      this.gl.enableVertexAttribArray(1);
                      this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 5*4, 0*4); // position
                      this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 5*4, 3*4); // texture
                      if (opt_fontcolor == null)
                      {
                         opt_fontcolor = this.defaultfontcolor;
                      }
                      this.engine.shadermanager.UseShader_Font(this.engine.matModelViewProjection,opt_fontcolor);
                      break;
                     
        case "poi": 
                      this.gl.enableVertexAttribArray(0);
                      this.gl.enableVertexAttribArray(1);
                      this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 5*4, 0*4); // position
                      this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 5*4, 3*4); // texture
                      if (opt_poicolor == null)
                      {
                         opt_poicolor = this.defaultpoicolor;
                      }
                      this.engine.shadermanager.UseShader_Poi(this.engine.matModelViewProjection,opt_poicolor);
                      break;
                             
             
        default:       
                      alert("unknown surface mode!!");
         
      }
  
      if (this.texture)
      {
         this.texture.Enable();
      }

      switch(this.indexsemantic)
      {
         case "TRIANGLES":
                           if(opt_ranged)
                           {
                              this.gl.drawElements(this.gl.TRIANGLES, count, this.gl.UNSIGNED_SHORT, offset);
                           }
                           else
                           {
                               this.gl.drawElements(this.gl.TRIANGLES, this.numindex, this.gl.UNSIGNED_SHORT, 0);
                           }                          
                           break;
         case "TRIANGLESTRIP":
                           if(opt_ranged)
                           {
                              this.gl.drawElements(this.gl.TRIANGLE_STRIP, count, this.gl.UNSIGNED_SHORT, offset);
                           }
                           else
                           {
                               this.gl.drawElements(this.gl.TRIANGLE_STRIP, this.numindex, this.gl.UNSIGNED_SHORT, 0);
                           }                          
                           break;                  
         case "LINES":     
                           this.gl.drawElements(this.gl.LINES, this.numindex, this.gl.UNSIGNED_SHORT, 0);
                           break;
                           
         case "POINTS":     
                           this.gl.drawElements(this.gl.POINTS, this.numindex, this.gl.UNSIGNED_SHORT, 0);
                           break;             
                        
         default:          
                           alert("unknown indexsemantic");
      }
      

      if(this.modelMatrix)
      {     
         this.engine.PopMatrices();   
      }  
      if (this.texture)
      {
         this.texture.Disable();
      }
          
      this.gl.disableVertexAttribArray(0);
      this.gl.disableVertexAttribArray(1);
      this.gl.disableVertexAttribArray(2);
      this.gl.disableVertexAttribArray(3);  
}

//------------------------------------------------------------------------------
/** 
 * @description download callback
 * @ignore
 */
function _cbfjsondownload(surface)
{
   if (surface.http.readyState==4)
   {
      if(surface.http.status==404)
      {
         if (surface.cbf)
         {
            surface.cbf(surface);
         }
      }
      else
      {
         var data=surface.http.responseText;      
         var jsonobject=/** @type {ObjectJSON} */ goog.json.parse(data);
         surface.CreateFromJSONObject(jsonobject,null,null,surface);
      }     
   }    
}

/**
 * @description parses a downloaded jsonobject and fills alle necessary data
 * @param {ObjectJSON} jsonobject
 * @param {Surface=} surface if this function is used in a callback.
 *
 */
Surface.prototype.CreateFromJSONObject = function(jsonobject,readycbf,failedcbf,surface)
{     
   if(!surface)
   {
      surface = this;
   }
   if(failedcbf)
   {
      this.cbf = failedcbf;
   }
   if(readycbf)
   {
      this.cbr = readycbf;  
   }
   if (jsonobject['BoundingBox'])
   {
      surface.bbmin = jsonobject['BoundingBox'][0];
      surface.bbmax = jsonobject['BoundingBox'][1];
   }
   
   if (jsonobject['Offset'])
   {
      surface.offset = jsonobject['Offset'];
   }
   
   if (jsonobject['CurtainIndex'])
   {
      surface.curtainindex = jsonobject['CurtainIndex'];
   }
   
   switch(jsonobject['VertexSemantic'])
   {
      case "p":      surface.numvertex = jsonobject['Vertices'].length/3;
                     surface.SetBufferP(jsonobject['Vertices']);
                     surface.mode = "p";
                          
                     break;
                      
      case "pnt":    surface.numvertex = jsonobject['Vertices'].length/8;
                     surface.SetBufferPNT(jsonobject['Vertices']);
                     surface.mode = "pnt";
                     
                     break;
                     
      case "pc":     surface.numvertex = jsonobject['Vertices'].length/7; 
                     surface.mode = "pc";
                     surface.SetBufferPC(jsonobject['Vertices']); 
                     break;
                     
      case "pt":     surface.numvertex = jsonobject['Vertices'].length/5; 
                     surface.mode = "pt";   
                     surface.SetBufferPT(jsonobject['Vertices']);
                     break;
                     
      case "pnct":   surface.numvertex = jsonobject['Vertices'].length/12;
                     surface.mode = "p";
                     surface.SetBufferPNCT(jsonobject['Vertices']);
                     break;
   
      default:       
                     alert("unknown surface mode!!");
   }      
   surface.SetIndexBuffer(jsonobject['Indices'],jsonobject['IndexSemantic']);
   
   if (jsonobject['DiffuseMap'])
   {
      surface.texture = new Texture(surface.engine);
      
      var cbr = function(){surface.cbfTextureLoadCallback_ready()};
      var cbf = function(){surface.cbfTextureLoadCallback_failed()};
      surface.texture.loadTexture(jsonobject['DiffuseMap'],cbr,cbf,true);
      surface.manageTexture = true;
   }
   
   if(jsonobject['Center'])
   {
      surface.SetAsNavigationFrame(jsonobject['Center'][0],jsonobject['Center'][1],jsonobject['Center'][2]);
   }
   
   
   surface.numindex = jsonobject['Indices'].length;         // number of elements of index vector
   if(!surface.manageTexture) //if there is a async texture load started set the ready flag in texture callback
   {
      surface.ready =true;  
   }
   
   if(surface.cbfJSONLoad)
   {
      surface.cbfJSONLoad();
   }
   
   if (surface.cbr && !surface.manageTexture)
   {
      surface.cbr(surface);
   }
}

/**
 * @description called when the texture is completely loaded.
 *
 */
Surface.prototype.cbfTextureLoadCallback_ready = function()
{
   this.ready = true;
   if (this.cbr)
   {
      this.cbr(this);
   }
   
}


/**
 * @description called when the texture download fails.
 */
Surface.prototype.cbfTextureLoadCallback_failed = function()
{
   goog.debug.Logger.getLogger('owg.Mesh').warning("Downloading Error: Texture not found...");
   if (this.cbf)
   {
      this.cbf(this);
   }
}


//------------------------------------------------------------------------------
/**
 * @description Load surface-data from a JSON file.
 * @param {string} url the url to the JSON file.
 * @param {function()=} opt_callbackready optional function called when surface finished download
 * @param {function()=} opt_callbackfailed optional function called when surface failed download
 */
Surface.prototype.loadFromJSON = function(url, opt_callbackready, opt_callbackfailed)
{
   if(url == null) 
   {
      alert("invalid json-url");
      return;
   }  
   this.jsonUrl=url;
      
   this.http=new window.XMLHttpRequest();
   this.http.open("GET",this.jsonUrl,true);
   //this.http.setRequestHeader("Cache-Control", "public");
   
   this.cbr = opt_callbackready;
   this.cbf = opt_callbackfailed;
   
   var me=this;
   this.http.onreadystatechange = function(){_cbfjsondownload(me);};
   this.http.send();  
}

//------------------------------------------------------------------------------
/**
 * @description Specify the function called as soon as the JSON File is fully loaded. This is optional.
 * @param {function()} f Callback Function which has "surface" as param.
 * */
Surface.prototype.SetJSONLoadCallback = function(f)
{
   this.cbfJSONLoad = f;
}




/**
 * @description   Test for ray Surface intersection iterates through all triangles.
 * @param {number} x x ray startpoint x coordinate
 * @param {number} y y ray startpoint y coordinate
 * @param {number} z z ray startpoint z coordinate
 * @param {number} dirx normalized direction x coordinate
 * @param {number} diry normalized direction y coordinate
 * @param {number} dirz normalized direction z coordinate
 */
Surface.prototype.TestRayIntersection = function(x,y,z,dirx,diry,dirz)
{
   var hit = false;
   var u,v,t;
   u = 0;
   v = 0;
   t = 1e20;      
                     
   for(var i=0; i < this.numOfTriangles; i++)
   {
      var setTriangle = this.SetCurrentTriangle(i);
      if(!setTriangle)
      {
         continue; 
      }
         
      if(this.modelMatrix)
      { 
         var invModelMatrix = new mat4();
         invModelMatrix.CopyFrom(this.newModelMatrix);
         
         var v1 = new vec3();
         v1.Set(this.currentTriangle.v1x,this.currentTriangle.v1y,this.currentTriangle.v1z);
              
         var v2 = new vec3();
         v2.Set(this.currentTriangle.v2x,this.currentTriangle.v2y,this.currentTriangle.v2z);
              
         var v3 = new vec3();
         v3.Set(this.currentTriangle.v3x,this.currentTriangle.v3y,this.currentTriangle.v3z);
              
             
         var vector = invModelMatrix.MultiplyVec3(v1);
         
         var vector2 = invModelMatrix.MultiplyVec3(v2);
          
         var vector3 = invModelMatrix.MultiplyVec3(v3);

         
         var result = this.intersector.IntersectTriangle(x,y,z,dirx,diry,dirz,vector.Get()[0],vector.Get()[1],vector.Get()[2],vector2.Get()[0],vector2.Get()[1],vector2.Get()[2],vector3.Get()[0],vector3.Get()[1],vector3.Get()[2]);        

       }  
       else
       {
         var result = this.intersector.IntersectTriangle(x,y,z,dirx,diry,dirz,this.currentTriangle.v1x,this.currentTriangle.v1y,this.currentTriangle.v1z,this.currentTriangle.v2x,this.currentTriangle.v2y,this.currentTriangle.v2z,this.currentTriangle.v3x,this.currentTriangle.v3y,this.currentTriangle.v3z);        
       }
                  
      if(result)
      {
         hit = true;  
         
         if(result.t < t && result.t>0)
         {
            t = result.t;
            u = result.u;
            v = result.v;
         }              
      }
   }
   
   if (hit)
   {
      var hitresult = {};
      hitresult.t = t;
      hitresult.u = u;
      hitresult.v = v;
      return hitresult;
   }
    
   return null;
}


/**
 * @ignore
 * @description Reads a Triangle from the current vertexBuffer using the correct mode and sets the value to this.currentTriangle.v...values
 */
Surface.prototype.SetCurrentTriangle = function(triangleNumber)
{
   switch(this.indexsemantic)
   {
      case "TRIANGLES":
                        this.currentTriangle.v1x = this.vertexbufferdata[this.indexbufferdata[triangleNumber*3]*this.vertexLength];
                        this.currentTriangle.v1y = this.vertexbufferdata[this.indexbufferdata[triangleNumber*3]*this.vertexLength+1];
                        this.currentTriangle.v1z = this.vertexbufferdata[this.indexbufferdata[triangleNumber*3]*this.vertexLength+2];
              
                        this.currentTriangle.v2x = this.vertexbufferdata[this.indexbufferdata[triangleNumber*3+1]*this.vertexLength];
                        this.currentTriangle.v2y = this.vertexbufferdata[this.indexbufferdata[triangleNumber*3+1]*this.vertexLength+1];
                        this.currentTriangle.v2z = this.vertexbufferdata[this.indexbufferdata[triangleNumber*3+1]*this.vertexLength+2];
              
                        this.currentTriangle.v3x = this.vertexbufferdata[this.indexbufferdata[triangleNumber*3+2]*this.vertexLength];
                        this.currentTriangle.v3y = this.vertexbufferdata[this.indexbufferdata[triangleNumber*3+2]*this.vertexLength+1];
                        this.currentTriangle.v3z = this.vertexbufferdata[this.indexbufferdata[triangleNumber*3+2]*this.vertexLength+2];     
                        break;
                        
      case "TRIANGLESTRIP":
      
                        if(triangleNumber%2 == 0) //even
                        {    
                          this.currentTriangle.v1x = this.vertexbufferdata[this.indexbufferdata[triangleNumber]*this.vertexLength];
                          this.currentTriangle.v1y = this.vertexbufferdata[this.indexbufferdata[triangleNumber]*this.vertexLength+1];
                          this.currentTriangle.v1z = this.vertexbufferdata[this.indexbufferdata[triangleNumber]*this.vertexLength+2];
              
                          this.currentTriangle.v2x = this.vertexbufferdata[this.indexbufferdata[triangleNumber+1]*this.vertexLength];
                          this.currentTriangle.v2y = this.vertexbufferdata[this.indexbufferdata[triangleNumber+1]*this.vertexLength+1];
                          this.currentTriangle.v2z = this.vertexbufferdata[this.indexbufferdata[triangleNumber+1]*this.vertexLength+2];
              
                          this.currentTriangle.v3x = this.vertexbufferdata[this.indexbufferdata[triangleNumber+2]*this.vertexLength];
                          this.currentTriangle.v3y = this.vertexbufferdata[this.indexbufferdata[triangleNumber+2]*this.vertexLength+1];
                          this.currentTriangle.v3z = this.vertexbufferdata[this.indexbufferdata[triangleNumber+2]*this.vertexLength+2]; 
                        }
                        else
                        {
                          this.currentTriangle.v1x = this.vertexbufferdata[this.indexbufferdata[triangleNumber+1]*this.vertexLength];
                          this.currentTriangle.v1y = this.vertexbufferdata[this.indexbufferdata[triangleNumber+1]*this.vertexLength+1];
                          this.currentTriangle.v1z = this.vertexbufferdata[this.indexbufferdata[triangleNumber+1]*this.vertexLength+2];
              
                          this.currentTriangle.v2x = this.vertexbufferdata[this.indexbufferdata[triangleNumber]*this.vertexLength];
                          this.currentTriangle.v2y = this.vertexbufferdata[this.indexbufferdata[triangleNumber]*this.vertexLength+1];
                          this.currentTriangle.v2z = this.vertexbufferdata[this.indexbufferdata[triangleNumber]*this.vertexLength+2];
              
                          this.currentTriangle.v3x = this.vertexbufferdata[this.indexbufferdata[triangleNumber+2]*this.vertexLength];
                          this.currentTriangle.v3y = this.vertexbufferdata[this.indexbufferdata[triangleNumber+2]*this.vertexLength+1];
                          this.currentTriangle.v3z = this.vertexbufferdata[this.indexbufferdata[triangleNumber+2]*this.vertexLength+2];          
                        }                     
                          
                        break;
                        
      default: 
                        goog.debug.Logger.getLogger('owg.Surface').warning("This indexsemantic is not supported for function: Surface.ReadTriangleFromBuffer() ");
                        break;
      
   }
   
   // is there a virtual camera offset?
   if (this.offset)
   {
      this.currentTriangle.v1x += this.offset[0]; this.currentTriangle.v1y += this.offset[1]; this.currentTriangle.v1z += this.offset[2];
      this.currentTriangle.v2x += this.offset[0]; this.currentTriangle.v2y += this.offset[1]; this.currentTriangle.v2z += this.offset[2];
      this.currentTriangle.v3x += this.offset[0]; this.currentTriangle.v3y += this.offset[1]; this.currentTriangle.v3z += this.offset[2];
   }
   
   if(this.indexbufferdata[triangleNumber] == this.indexbufferdata[triangleNumber+1]
                              || this.indexbufferdata[triangleNumber] == this.indexbufferdata[triangleNumber+2]
                                 || this.indexbufferdata[triangleNumber+1] == this.indexbufferdata[triangleNumber+2])
   {
       return false;
   }
   return true;
   
   
}

//------------------------------------------------------------------------------
/**
 * @description Updates the bounding box of the Surface
 * (Warning: currently ignoring mesh model matrix)
 */
Surface.prototype.UpdateAABB = function()
{
   var minx = 1e20;
   var miny = 1e20;
   var minz = 1e20;
   var maxx = -1e20;
   var maxy = -1e20;
   var maxz = -1e20;
   var vx,vy,vz;
   
   // 
   for (var i=0;i<this.vertexbufferdata.length;i++)
   {
      vx = this.vertexbufferdata[i*this.vertexLength];
      vy = this.vertexbufferdata[i*this.vertexLength+1];
      vz = this.vertexbufferdata[i*this.vertexLength+2];
      
   
      if (vx>maxx) { maxx = vx;}
      if (vy>maxy) { maxy = vy;}
      if (vz>maxz) { maxz = vz;}
      if (vx<minx) { minx = vx;}
      if (vy<miny) { miny = vy;}
      if (vz<minz) { minz = vz;}
   }
   
   
   if(this.modelMatrix)
   {
      var p1 = new vec3(minx,miny,minz);
      var p2 = new vec3(maxx,miny,minz);
      var p3 = new vec3(maxx,maxy,minz);
      var p4 = new vec3(minx,maxy,minz);
      var p5 = new vec3(minx,miny,maxz);
      var p6 = new vec3(minx,maxy,maxz);
      var p7 = new vec3(maxx,maxy,maxz);
      var p8 = new vec3(minx,maxy,maxz);
      
      //transform
      var p1t = this.modelMatrix.MultiplyVec3(p1);
      var p2t = this.modelMatrix.MultiplyVec3(p2);
      var p3t = this.modelMatrix.MultiplyVec3(p3);
      var p4t = this.modelMatrix.MultiplyVec3(p4);
      var p5t = this.modelMatrix.MultiplyVec3(p5);
      var p6t = this.modelMatrix.MultiplyVec3(p6); 
      var p7t = this.modelMatrix.MultiplyVec3(p7);
      var p8t = this.modelMatrix.MultiplyVec3(p8);

      //sort all
      var px = new Array(p1t.Get()[0],p2t.Get()[0],p3t.Get()[0],p4t.Get()[0],p5t.Get()[0],p6t.Get()[0],p7t.Get()[0],p8t.Get()[0]);
      var py = new Array(p1t.Get()[1],p2t.Get()[1],p3t.Get()[1],p4t.Get()[1],p5t.Get()[1],p6t.Get()[1],p7t.Get()[1],p8t.Get()[1]);
      var pz = new Array(p1t.Get()[2],p2t.Get()[2],p3t.Get()[2],p4t.Get()[2],p5t.Get()[2],p6t.Get()[2],p7t.Get()[2],p8t.Get()[2]);
      
      px.sort();
      py.sort();
      pz.sort();
      
      minx = px[0];
      maxx = px[px.length-1];
      
      miny = py[0];
      maxy = py[py.length-1];
      
      minz = pz[0];
      maxz = pz[pz.length-1];
      
   }
   
   // if this node has a high precision virtual camera offset, add it to the vertices.
   if (this.offset)
   {
      minx += this.offset[0];
      miny += this.offset[1];
      minz += this.offset[2];
      maxx += this.offset[0];
      maxy += this.offset[1];
      maxz += this.offset[2];
   } 
   
   if (goog.isNull(this.bbmin)) // no bounding box yet ?
   {
      this.bbmin = new Array(3);
   }
   if (goog.isNull(this.bbmax))
   {
      this.bbmax = new Array(3);
   }
   
   this.bbmin[0] = minx;
   this.bbmin[1] = miny;
   this.bbmin[2] = minz;
   this.bbmax[0] = maxx;
   this.bbmax[1] = maxy;
   this.bbmax[2] = maxz;
   
}


//------------------------------------------------------------------------------
/**
 * @description   Test for ray bounding box intersection
 * @param {number} x x ray startpoint x coordinate
 * @param {number} y y ray startpoint y coordinate
 * @param {number} z z ray startpoint z coordinate
 * @param {number} dirx normalized direction x coordinate
 * @param {number} diry normalized direction y coordinate
 * @param {number} dirz normalized direction z coordinate
 */
Surface.prototype.TestBoundingBoxIntersection = function(x,y,z,dirx,diry,dirz)
{
   var result = this.aabb.HitBox(x,y,z,dirx,diry,dirz,this.bbmin[0],this.bbmin[1],this.bbmin[2],this.bbmax[0],this.bbmax[1],this.bbmax[2]);         

   return result;  //if result = null -> no hit!
}


/**
 * @description fills the modelmatrix to use this Surface as billboard.
 */
Surface.prototype.SetAsBillboard= function(x,y,z,translationX,translationY,translationZ)
{
   var view = this.engine.matView.Get();
   var bbmat = new mat4();
   this.billboardPos[0] = x;
   this.billboardPos[1] = y;
   this.billboardPos[2] = z;
   this.billboardCenterTrans[0] = translationX || 0;
   this.billboardCenterTrans[1] = translationY || 0;
   this.billboardCenterTrans[2] = translationZ || 0;
   
   bbmat.Set([view[0],view[4],view[8],0,view[1],view[5],view[9],0,view[2],view[6],view[10],0,this.billboardPos[0],this.billboardPos[1],this.billboardPos[2],1]);
   var transMat = new mat4();
   transMat.Translation(this.billboardCenterTrans[0],this.billboardCenterTrans[1],this.billboardCenterTrans[2]);
   var newBbmat = new mat4();
   newBbmat.Multiply(bbmat,transMat);

   this.modelMatrix = newBbmat;
}

/**
 * @description updates the billboard matrix
 * @ignore
 */
Surface.prototype.UpdateBillboardMatrix = function()
{
   this.SetAsBillboard(this.billboardPos[0],this.billboardPos[1],this.billboardPos[2],this.billboardCenterTrans[0],this.billboardCenterTrans[1],this.billboardCenterTrans[2]);
}

/**
 * @description sets the model matrix as a navigation frame matrix.
 * @param {number} lng the longitude coordinate
 * @param {number} lat the latitude coordinate
 * @param {number} elv the elevation 
 */
Surface.prototype.SetAsNavigationFrame = function(lng,lat,elv)
{
   var coords = new GeoCoord(lng, lat,elv);
   var cartesianCoordinates = new Array(3);
   coords.ToCartesian(cartesianCoordinates);
   
   var matTrans = new mat4();
   matTrans.Translation(cartesianCoordinates[0],cartesianCoordinates[1],cartesianCoordinates[2]);
     
   var mat = new mat4();
   mat.CalcNavigationFrame(lng,lat);
   
   var a = new Float32Array(16);
   var mmatvals = mat.Get();
   a[0] = mmatvals[0];
   a[1] = mmatvals[1];
   a[2] = mmatvals[2];
   a[3] = mmatvals[3];
   a[4] = mmatvals[4];
   a[5] = mmatvals[5];
   a[6] = mmatvals[6];
   a[7] = mmatvals[7];
   a[8] = mmatvals[8];
   a[9] = mmatvals[9];
   a[10] = mmatvals[10];
   a[11] = mmatvals[11];
   a[12] = cartesianCoordinates[0];
   a[13] = cartesianCoordinates[1];
   a[14] = cartesianCoordinates[2];
   a[15] = 1;
   
   var navMat = new mat4();
   navMat.Set(a);
   
   //scaling because the units of a 3d models are meters
   var scaleMat = new mat4();
   scaleMat.Scale(CARTESIAN_SCALE_INV,CARTESIAN_SCALE_INV,CARTESIAN_SCALE_INV)
   
   var scaledNavMat = new mat4();
   scaledNavMat.Multiply(navMat,scaleMat);
   
   var rotatedMat = new mat4();
   rotatedMat.RotationX(-1.57079633);
   
   var scaledRotNavMat = new mat4();
   scaledRotNavMat.Multiply(scaledNavMat,rotatedMat);
   
   this.modelMatrix = scaledRotNavMat;
   this.UpdateAABB();
}


/**
 * @description copies data from another meshclass into this mesh-class. e.g. used for icon-pois
 * @param {Surface} surface the mesh object from wich the data will be copied.
 */
Surface.prototype.CopyFrom = function(surface)
{
   this.SetTexture(surface.texture);               
   this.vertexbufferdata = surface.vertexbufferdata;
   this.mode = surface.mode;
   this.vertexLength = surface.vertexLength;
   this.indexbufferdata = surface.indexbufferdata;
   this.indexsemantic = surface.indexsemantic
   this.numindex = surface.numindex
   this.Ready = surface.Ready;
   this.numOfTriangles = surface.numOfTriangles;
}

goog.exportSymbol('Surface', Surface);
goog.exportProperty(Surface.prototype, 'Draw', Surface.prototype.Draw);
goog.exportProperty(Surface.prototype, 'CopyFrom', Surface.prototype.CopyFrom);
goog.exportProperty(Surface.prototype, 'SetAsBillboard', Surface.prototype.SetAsBillboard);
goog.exportProperty(Surface.prototype, 'SetTexture', Surface.prototype.SetTexture);
goog.exportProperty(Surface.prototype, 'TestBoundingBoxIntersection', Surface.prototype.TestBoundingBoxIntersection);
goog.exportProperty(Surface.prototype, 'TestRayIntersection', Surface.prototype.TestRayIntersection);
