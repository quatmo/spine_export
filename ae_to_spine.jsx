{
/*
	Export After Effects to Spine JSON
	Version 16

	Script for exporting After Effects animations as Spine JSON.
	For use with Spine from Esoteric Software.

	Copyright (c) 2014 Nimai Malle <nimai@beecavegames.com>

	Portions Copyright (c) 2012 Cole Reed <info@auralgrey.com>
	Derived from AE2JSON v0.5 https://github.com/ichabodcole/AE2JSON.git
*/

	#include "lib/json2.js"
	#include "lib/utilities.js"

	// Returns the class name of the argument or undefined if it's not a valid JavaScript object.
	function getObjectClass(obj) {
		if (obj && obj.constructor && obj.constructor.toString) {
			var arr = obj.constructor.toString().match(/function\s*(\w+)/);
			if (arr && arr.length == 2) {
				return arr[1];
			}
		}
		return undefined;
	}

	function sqr(x) { return x * x; }
	function dist2(v, w) { return sqr(v[0] - w[0]) + sqr(v[1] - w[1]); }
	function dist(v, w) { return Math.sqrt(sqr(v[0] - w[0]) + sqr(v[1] - w[1])); }
	function distToSegmentSquared(p, v, w) {
		var l2 = dist2(v, w);
		if (l2 == 0) return dist2(p, v);
		var t = ((p[0] - v[0]) * (w[0] - v[0]) + (p[1] - v[1]) * (w[1] - v[1])) / l2;
		if (t < 0) return dist2(p, v);
		if (t > 1) return dist2(p, w);
		return dist2(p, [
			v[0] + t * (w[0] - v[0]),
			v[1] + t * (w[1] - v[1])
		]);
	}
	function distToSegment(p, v, w) { return Math.sqrt(distToSegmentSquared(p, v, w)); }

	function AE2JSON(thisObj,saveToFile) {
		if (app.project.file == null) {
			alert("Please save this project file first, then run again.")
			return;
		}

		this.proj = app.project;
		this.referencedComps = [app.project.activeItem];
		this.activeComp = app.project.activeItem.name;
		this.compBones = [];
		this.compData = {};
		while (this.referencedComps.length > 0) {
			this.comp = this.referencedComps.shift();
			if (!this.compData[this.comp.name]) {
				this.jsonData = {};
				this.jsonData.projectSettings = {};
				this.jsonData.compositions = [];
				this.jsonData.compositions[0] = {};
				// create defaultComp until we export all project compositions
				// and not just the current comp.
				this.defaultComp = this.jsonData.compositions[0];
				this.orgTimeDisplayType = this.proj.timeDisplayType;
				this.proj.timeDisplayType = TimeDisplayType.FRAMES;
				this.defaultComp.compSettings = new CompSettings(this.comp);
				this.defaultComp.layers = [];
				this.doCompLayers(this.comp);
				this.compData[this.comp.name] = this.generateSpineData();
			}
		}

		this.jsonData = this.compData[this.activeComp];
		this.combineComps();

		this.renderJSON(saveToFile);

		this.proj.timeDisplayType = this.orgTimeDisplayType;
	}

	AE2JSON.prototype.combineComps = function(){
		var i=0;
		while (i < this.jsonData.bones.length) {
			if (this.jsonData.bones[i].comp) {
				var compName = this.jsonData.bones[i]["comp"];
				var compData = this.compData[ compName ]
				var compInPoint = this.jsonData.bones[i]["inPoint"];
				this.copyCompData(this.jsonData.bones[i],compName,compData,compInPoint);
				delete this.jsonData.bones[i]["comp"];
				delete this.jsonData.bones[i]["inPoint"];
			}
			i++;
		}
	}

	AE2JSON.prototype.copyCompData = function(parentBone,compName,compData,compInPoint){
		// Make a copy first
		compData = JSON.parse(JSON.stringify(compData));
		//
		// Copy bones
		//
		var numBones = compData.bones.length;
		for (var i=0; i<numBones; i++) {
			var boneData = compData.bones[i];
			if (boneData.parent) {
				var newBoneData = {};
				for (var prop in boneData) {
					newBoneData[prop] = boneData[prop];
				}
				if (newBoneData.parent == "root") {
					newBoneData.parent = parentBone.name;
				} else {
					newBoneData.parent = parentBone.name+"_"+newBoneData.parent;
				}
				newBoneData.name = parentBone.name+"_"+newBoneData.name;
				this.jsonData.bones.push(newBoneData);
			}
		}
		//
		// Copy slots
		//
		var index = 0;
		while (index < this.jsonData.slots.length) {
			if (this.jsonData.slots[index]["comp"] == parentBone.name) {
				break;
			}
			index++;
		}
		var numSlots = compData.slots.length;
		for (var i=0; i<numSlots; i++) {
			var slotData = compData.slots[i];
			var name = slotData["name"]
			var attachment = slotData["attachment"] ? slotData["attachment"] : null;
			var newSlotData = {
				"name": parentBone.name+"_"+name,
				"bone": parentBone.name+"_"+slotData["bone"],
				"attachment": attachment
			};
			if (slotData["additive"]) {
				newSlotData["additive"] = slotData["additive"];
			}
			if (slotData["color"]) {
				newSlotData["color"] = slotData["color"];
			}
			if (slotData["comp"]) {
				newSlotData["comp"] = parentBone.name+"_"+slotData["comp"];
			}
			this.jsonData.slots.splice(index+i,0,newSlotData);
			if (compInPoint > 0) {
				var animData = compData.animations["animation"]["slots"][name];
				var attachmentTimeline;
				if (!animData) {
					attachmentTimeline = []
					animData = compData.animations["animation"]["slots"][name] = {
						"attachment": attachmentTimeline
					};
				} else {
					attachmentTimeline = animData["attachment"];
					if (!attachmentTimeline) {
						attachmentTimeline = animData["attachment"] = [];
					}
				}
				var newAnimData = {
					"time": -compInPoint,
					"name": null
				};
				attachmentTimeline.splice(0,0,newAnimData);
				newAnimData = {
					"time": 0,
					"name": attachment
				};
				attachmentTimeline.splice(1,0,newAnimData);
			}
		}
		if (this.jsonData.slots[index+i]["comp"]) {
			this.jsonData.slots.splice(index+i,1);
		}
		//
		// Copy skins
		//
		for (var name in compData.skins["default"]) {
			var skinData = compData.skins["default"][name];
			var newSkinData = {};
			for (var prop in skinData) {
				newSkinData[prop] = skinData[prop];
			}
			this.jsonData.skins["default"][parentBone.name+"_"+name] = newSkinData;
		}
		//
		// Copy animations
		//
		for (var name in compData.animations["animation"]["slots"]) {
			var animData = compData.animations["animation"]["slots"][name];
			this.jsonData.animations["animation"]["slots"][parentBone.name+"_"+name] = animData;
			this.addInPoint( animData, compInPoint );
		}
		for (var name in compData.animations["animation"]["bones"]) {
			var animData = compData.animations["animation"]["bones"][name];
			this.jsonData.animations["animation"]["bones"][parentBone.name+"_"+name] = animData;
			this.addInPoint( animData, compInPoint );
		}
	}

	AE2JSON.prototype.addInPoint = function(animData,inPoint){
		for (var prop in animData) {
			if (prop == "time") {
				animData["time"] += inPoint;
			} else if (animData[prop] && typeof animData[prop] == "object" ) {
				this.addInPoint( animData[prop], inPoint );
			} else if (animData[prop] instanceof Array ) {
				var len = animData[prop].length;
				for (var i=0; i<len; i++) {
					this.addInPoint( animData[prop][i], inPoint );
				}
			}
		}
	}

	AE2JSON.prototype.checkLayerType = function(layer){
		if(layer instanceof CameraLayer){
			return "CAMERA";
		}else if(layer instanceof LightLayer){
			return "LIGHT";
		}else if(layer.threeDLayer == true){
			if(layer.nullLayer == true){
				return "NULL";
			}else if(layer.nullLayer == false){
				return "SOLID";
			}
		}else if(layer instanceof AVLayer == true){
			return "AV";
		}else if(layer instanceof ShapeLayer == true){
			return "SHAPE";
		}
	}

	AE2JSON.prototype.doCompLayers = function(myComp) {
		var myComp, myLayer, numLayers, layerType;
		
		if(myComp instanceof CompItem) {
			numLayers = myComp.layers.length;
			
			for(i=0; i<numLayers; i++) {
				myLayer = myComp.layers[i+1];
				if(!myLayer.adjustmentLayer == true){

					layerType = this.checkLayerType(myLayer);
					switch(layerType){
						case "NULL":
							this.defaultComp.layers.push(new Null(this.defaultComp.compSettings, myLayer));
							break;
						case "AV":
							this.defaultComp.layers.push(new AV(this.defaultComp.compSettings, myLayer));
							if (myLayer.source instanceof CompItem) {
								this.referencedComps.push(myLayer.source)
							}
							break;
						case "SHAPE":
							this.defaultComp.layers.push(new ShapeObj(this.defaultComp.compSettings, myLayer));
							break;
						default:
							this.defaultComp.layers.push("unknown "+getObjectClass(myLayer));
							break;
					}
				}
			}
		}
	}

	AE2JSON.prototype.makeSpineBoneName = function(layer) {
		var layerName = layer.name.replace(/\.[a-z]+_/,'_');
  		if (layer.parent > 0) {
			var baseNameRegex = /^([A-Za-z ]+)[0-9]+.*$/;
			var baseName = layerName.replace(baseNameRegex,"$1");
			var layers = this.defaultComp.layers;
			var numLayers = layers.length;
			for (var i=0; i<numLayers; i++) {
				var otherLayer = layers[i];
				if (otherLayer.index != layer.index && otherLayer.parent == layer.parent) {
					var otherBaseName = otherLayer.name.replace(baseNameRegex,"$1");
					if (otherBaseName == baseName) {
						if ((otherLayer.inPoint <= layer.inPoint && otherLayer.outPoint <= layer.outPoint) ||
							(otherLayer.inPoint >= layer.inPoint && otherLayer.outPoint >= layer.outPoint)) {
							return baseName;
						}
					}
				}
			}
		}
		return layerName.replace(/([^\/]+)\/.*(_L[0-9]+)$/,"$1$2");
	}

	AE2JSON.prototype.makeSpineSlotName = function(layer) {
		return this.makeSpineBoneName(layer);
		// var layerName = layer.name;
		// return layerName.replace(/([^\/]+)\/.*(_L[0-9]+)$/,"$1$2");
	}


	AE2JSON.prototype.makeSpineAttachmentNameStr = function(layerName) {
		if (layerName == null) {
			return null;
		} else {
			var projectName = app.project.file.name.replace(/\.aep/,'');
			var attachmentName = layerName.replace(/([^\.]+).*/,"$1");
			attachmentName = attachmentName
				.replace(/_L[0-9]+$/,'')
				.replace(/ /g,'_')
				.replace(/\.[A-Za-z\.]+$/,'');
			// return layerName.replace(/([^\/]+)\/([^\.]+).*/,"$2-assets/$1").replace(/_L[0-9]+$/,'').replace(/ /g,'_');
			return projectName+"-assets/"+attachmentName;
		}
	}

	AE2JSON.prototype.makeSpineAttachmentName = function(layer, time) {
		var name = layer.name;
		if (time != undefined && layer.files) {
			var frame = 0;
			if (layer.timeRemap) {
				var key = 0;
				for (key = 0; key < layer.timeRemap.length; key++) {
					if (layer.timeRemap[key][0] <= time) {
						break;
					}
				}
				if (key == layer.timeRemap.length) {
					key = layer.timeRemap.length-1;
				}
				var nextKey = key+1;
				if (nextKey == layer.timeRemap.length) {
					nextKey = layer.timeRemap.length-1;
				}
				var beforeTime = layer.timeRemap[key][0];
				var afterTime = layer.timeRemap[nextKey][0];
				var dt1 = afterTime - beforeTime;
				var dt2 = time - beforeTime;
				var ratio = dt1 == 0 ? 0 : (dt2 / dt1);
				var beforeFrame = layer.timeRemap[key][1];
				var afterFrame = layer.timeRemap[nextKey][1];
				var df = afterFrame - beforeFrame;
				frame = Math.round( beforeFrame + (df * ratio) );
			} else {
				frame = Math.round( (time - layer.inPoint) / layer.frameRate);
			}
			// Cap?
			if (frame >= layer.files.length) {
				frame = layer.files.length - 1;
			}
			if (time < layer.inPoint || time > layer.outPoint) {
				name = null;
			} else {
				name = layer.files[frame];
				//if (frame == 0) { alert(name); }
			}
		}
		return this.makeSpineAttachmentNameStr( name );
	}

	AE2JSON.prototype.makeSpineAttachmentNames = function(layer) {
		var result = new Array()
		if (!layer.files) {
			result.push( this.makeSpineAttachmentName(layer) );
		} else {
			var numFiles = layer.files.length;
			for (var i=0; i<numFiles; ++i) {
				//alert( layer.files[i] );
				result.push( this.makeSpineAttachmentNameStr( layer.files[i] ));
			}
		}
		return result;
	}

	AE2JSON.prototype.generateSpineBones = function() {
		var bonesData = [ { "name": "root" } ];
		var layers = this.defaultComp.layers;
		var numLayers = layers.length;
		var boneNames = {};
		var boneGenerated = new Array();
		boneGenerated.push(0);
		this.rootScale = 1.0;
		this.rootX = 0.0;
		this.rootY = 0.0;
//alert(JSON.stringify(layers[0].transform.position)); 
		while( boneGenerated.length <= numLayers ) {
			for (var i=0; i<numLayers; i++) {
				var layer = layers[i];
				var boneName = this.makeSpineBoneName( layer );
				var parentExists = false;
				var layerExists = false;
				for (var j=0; j<boneGenerated.length; j++) {
					if (boneGenerated[j] == layer.parent) {
						parentExists = true;
					}
					if (boneGenerated[j] == layer.index) {
						layerExists = true;
					}
				}
				if ((layer.layerType == "AV" || layer.layerType == "Shape") && parentExists &&
					!layerExists && boneNames[boneName] != true) {
					var tx = layer.transform.position[0][1][0];
					var ty = -layer.transform.position[0][1][1];
					var sx = (layer.transform.scale[0][1][0] / 100.0);
					var sy = (layer.transform.scale[0][1][1] / 100.0);
					var parentIndex = layer.parent;
					var parentName = bonesData[0].name;	// root
					var parentOffsetX;
					var parentOffsetY;
					var scale = 1.0;//this.rootScale;
					if (parentIndex > 0) {
						parent = layers[parentIndex-1];
						parentName = this.makeSpineBoneName( parent );
						parentOffsetX = -parent.transform.anchorPoint[0][1][0];
						parentOffsetY = parent.transform.anchorPoint[0][1][1];
					} else if (layer.comp) {
						parentOffsetX = -layer.transform.anchorPoint[0][1][0];
						parentOffsetY = layer.transform.anchorPoint[0][1][1];
					} else {
						parentOffsetX = -this.rootX;
						parentOffsetY = this.rootY;
					}
					var boneData = {
						"name": boneName,
						"parent": parentName,
						"x": (tx + parentOffsetX) * scale,
						"y": (ty + parentOffsetY) * scale
					};
					if (layer.comp) {
						boneData["comp"] = layer.comp;
						boneData["inPoint"] = layer.inPoint;
					}
					if (layer.transform.scale.length <= 1) {
						if (Math.round(sx*10000) != 10000) {
							boneData["scaleX"] = sx;
						}
						if (Math.round(sy*10000) != 10000) {
							boneData["scaleY"] = sy;
						}
					}
					if (layer.transform.rotation.length <= 1) {
						var rotation = layer.transform.rotation[0][1];
						if (rotation != 0.0) {
							boneData["rotation"] = 360-rotation;
						}
					}
					boneNames[boneName] = true;
					if (layer.enabled) {
						bonesData.push(boneData);
					}
					boneGenerated.push(layer.index);
				} else {
					if (!layerExists && boneNames[boneName] == true ) {
						boneGenerated.push(layer.index);
					}
				}
			}
		}

		// Add metadata for sorting
		var numBones = bonesData.length;
		for (var i=0; i<numBones; i++) {
			var bone = bonesData[i];
			var parent = bone;
			var depth = 0;
			var fullName = bone["name"]
			while ( (parent = parent["parent"]) != undefined ) {
				for (var j=0; j<numBones; j++) {
					var otherBone = bonesData[j];
					if (otherBone["name"] == parent) {
						parent = otherBone;
						break;
					}
				}
				fullName = parent["name"] + fullName;
				depth++;
			}
			// bone["fullName"] = fullName;
			bone["depth"] = depth;
		}

		// Sort Spine bone data
		bonesData.sort( function(a,b) {
			if (a["depth"] == b["depth"]) {
				return a["name"].localeCompare( b["name"] );
			} else {
			 	return a["depth"] < b["depth"] ? -1 : 1;
			}
		} );

		// Remove metadata for sorting
		for (var i=0; i<numBones; i++) {
			var bone = bonesData[i];
			// delete bone["fullName"];
			delete bone["depth"];
		}

		return bonesData;
	}

	AE2JSON.prototype.generateSpineSlots = function() {
		var slotsData = [];
		var layers = this.defaultComp.layers;
		var numLayers = layers.length;
		for (var i=numLayers-1; i>=0; i--) {
			var layer = layers[i];
			if (layer.enabled) {
				var slotName = this.makeSpineSlotName( layer );
				var found = false;
				for (var j=0; j<slotsData.length; j++) {
					if (slotsData[j].name == slotName) {
						found = true;
						break;
					}
				}
				if (!found) {
					var attachmentName = this.makeSpineAttachmentName( layer, 0 );
					var slotData = {
						"name": slotName,
						"bone": this.makeSpineBoneName( layer )
					};
					if (layer.comp) {
						slotData["comp"] = slotData["bone"];
					}
					if (layer.inPoint <= 0.0) {
						slotData["attachment"] = attachmentName;
					}
					if (layer.blendingMode != BlendingMode.NORMAL) {
						slotData["additive"] = true;
					}
					var opacity = Math.round((layer.transform.opacity[0][1] / 100.0) * 0xFF);
					if (opacity != 0xFF) {
						var opacityHex = ("0"+opacity.toString(16)).substr(-2);
						slotData["color"] = "FFFFFF" + opacityHex;
					}
					slotsData.push( slotData );
				}
			}
		}
		return slotsData;
	}

	AE2JSON.prototype.generateSpineSkins = function() {
		var skinsData = {};
		var layers = this.defaultComp.layers;
		var numLayers = layers.length;
		for (var i=numLayers-1; i>=0; i--) {
			var layer = layers[i];
			if (!layer.comp && layer.enabled) {
				var slotName = this.makeSpineSlotName( layer );
				var attachmentNames = this.makeSpineAttachmentNames( layer );
				var skinData = skinsData[slotName];
				if (!skinData) {
					skinData = {};
				}
				var dx = layer.transform.anchorPoint[0][1][0] * this.rootScale;
				var dy = layer.transform.anchorPoint[0][1][1] * this.rootScale;
				var width = layer.width * this.rootScale;
				var height = layer.height * this.rootScale;
				var numAttachments = attachmentNames.length;
				for (var j=0; j<numAttachments; ++j) {
					skinData[ attachmentNames[j] ] = {
						"x":  width/2 - dx,
						"y": -height/2 + dy,
						"width": width,
						"height": height
					}
				}
				skinsData[slotName] = skinData;
			}
		}
		return { "default": skinsData };
	}

	AE2JSON.prototype.generateSpineSlotAnimations = function() {
		var slotAnimData = {};
		var layers = this.defaultComp.layers;
		var numLayers = layers.length;
		var numKeys, time;
		var frameDuration = this.defaultComp.compSettings.frameDuration;
		var compDuration = this.defaultComp.compSettings.duration;
		for (var i=numLayers-1; i>=0; i--) {
			var layer = layers[i];
			if (layer.comp) {
				continue;
			}
			var boneName = this.makeSpineBoneName( layer );
			if (layer.transform.opacity.length > 1) {
				var colorTimeline = [];
				numKeys = layer.transform.opacity.length;
				for (var j=0; j<numKeys; j++) {
					frame = layer.transform.opacity[j][0];
					var opacity = Math.round((layer.transform.opacity[j][1] / 100.0) * 255.0);
					var opacityHex = ("0"+opacity.toString(16)).substr(-2);
					colorTimeline.push({
						"time": frame * frameDuration,
						"color": "FFFFFF" + opacityHex
					});
				}
				if (!slotAnimData[boneName]) slotAnimData[boneName] = {};
				slotAnimData[boneName]["color"] = colorTimeline;
			}
			var attachmentTimeline = null;
			var attachmentName = this.makeSpineAttachmentName( layer, 0 );

			numKeys = layer.timeRemap ? layer.timeRemap.length : 0;

			if (layer.inPoint > 0.0) {
				if (!slotAnimData[boneName]) slotAnimData[boneName] = {};
				attachmentTimeline = slotAnimData[boneName]["attachment"];
				if (!attachmentTimeline) {
					slotAnimData[boneName]["attachment"] = attachmentTimeline = []
					if (numKeys > 1) {
						attachmentTimeline.push({
							"time": 0,
							"name": null
						});
					}
					attachmentName = this.makeSpineAttachmentName( layer, layer.inPoint );
					attachmentTimeline.push({
						"time": layer.inPoint,
						"name": attachmentName
					});
				}
			}

			if (layer.files) {
				if (!slotAnimData[boneName]) slotAnimData[boneName] = {};
				attachmentTimeline = slotAnimData[boneName]["attachment"];
				if (!attachmentTimeline) slotAnimData[boneName]["attachment"] = attachmentTimeline = [];
				if (layer.timeRemap) {
					for (var index=0; index<numKeys; index++) {
						var nextIndex = (index+1 < numKeys) ? index+1 : index;
						var fromTime = layer.timeRemap[index][0];
						var toTime = layer.timeRemap[nextIndex][0];
						var fromFrame = layer.timeRemap[index][1];
						var toFrame = layer.timeRemap[nextIndex][1];
						var numFrames = Math.abs(toFrame - fromFrame) + 1;
						var keyDuration = toTime - fromTime;
						var dt = keyDuration / (numFrames+1);
						var step = fromFrame > toFrame ? -1 : 1;
						for (var j=0; j<numFrames; j++) {
							var frame = fromFrame + (j * step);
							if (frame >= layer.files.length) {
								frame = layer.files.length-1;
							} else if (frame < 0) {
								frame = 0;
							}
							var time = fromTime + (dt * j);
							var thisFramesAttachmentName = this.makeSpineAttachmentNameStr( layer.files[frame] );
							if (thisFramesAttachmentName != attachmentName) {
								attachmentTimeline.push({
									"time": time,
									"name": thisFramesAttachmentName
								});
								attachmentName = thisFramesAttachmentName;
							}
						}
					}
				} else {
					var fromTime = layer.inPoint;
					var toTime = layer.outPoint;
					var duration = toTime - fromTime;
					var numFrames = layer.files.length;
					var dt = duration / (numFrames+1);
					for (var frame=0; frame<numFrames; frame++) {
						var time = fromTime + (dt * frame);
						var thisFramesAttachmentName = this.makeSpineAttachmentNameStr( layer.files[frame] );
						if (thisFramesAttachmentName != attachmentName) {
							attachmentTimeline.push({
								"time": time,
								"name": thisFramesAttachmentName
							});
							attachmentName = thisFramesAttachmentName;
						}
					}
				}
			}

			if (layer.outPoint < compDuration) {
				if (!slotAnimData[boneName]) slotAnimData[boneName] = {};
				attachmentTimeline = slotAnimData[boneName]["attachment"];
				if (!attachmentTimeline) slotAnimData[boneName]["attachment"] = attachmentTimeline = [];
				attachmentTimeline.push({
					"time": layer.outPoint,
					"name": null
				});
			}

		}
		return slotAnimData;
	}

	AE2JSON.prototype.generateSpineBoneAnimations = function() {
		var boneAnimData = {};
		var layers = this.defaultComp.layers;
		var numLayers = layers.length;
		var numKeys, time;
		var frameDuration = this.defaultComp.compSettings.frameDuration;
		for (var i=numLayers-1; i>=0; i--) {
			var layer = layers[i];
			if (layer.enabled) {
				var boneName = this.makeSpineBoneName( layer );
				if (layer.transform.position.length > 1) {
					var translateTimeline = [];
					numKeys = layer.transform.position.length;
					for (var j=0; j<numKeys; j++) {
						frame = layer.transform.position[j][0];
						var keyData =  {
							"time": frame * frameDuration,
							"x": (layer.transform.position[j][1][0] - layer.transform.position[0][1][0]) * this.rootScale,
							"y":-(layer.transform.position[j][1][1] - layer.transform.position[0][1][1]) * this.rootScale
						};
						var tangentType = layer.transform.position[j][2];
						if (tangentType == "hold") {
							keyData["curve"] = "stepped";
						} else if (tangentType == "bezier" && j < numKeys-1) {
							keyData["curve"] = [
								layer.transform.position[j][3][0],
								layer.transform.position[j][3][1],
								layer.transform.position[j][4][0],
								layer.transform.position[j][4][1]
							];
						}
						translateTimeline.push( keyData );
					}
					if (!boneAnimData[boneName]) boneAnimData[boneName] = {};
					boneAnimData[boneName]["translate"] = translateTimeline;
				}
				if (layer.transform.scale.length > 1) {
					var scaleTimeline = [];
					numKeys = layer.transform.scale.length;
					for (var j=0; j<numKeys; j++) {
						frame = layer.transform.scale[j][0];
						var keyData = {
							"time": frame * frameDuration,
							"x": layer.transform.scale[j][1][0] / 100.0,
							"y": layer.transform.scale[j][1][1] / 100.0
						};
						var tangentType = layer.transform.scale[j][2];
						if (tangentType == "hold") {
							keyData["curve"] = "stepped";
						}
						scaleTimeline.push( keyData );
					}
					if (!boneAnimData[boneName]) boneAnimData[boneName] = {};
					boneAnimData[boneName]["scale"] = scaleTimeline;
				}
				if (layer.transform.rotation.length > 1) {
					var rotateTimeline = [];
					numKeys = layer.transform.rotation.length;
					var lastValue = 360 - layer.transform.rotation[0][1];
					var lastTime = layer.transform.rotation[0][0] * frameDuration;
					for (var j=0; j<numKeys; j++) {
						var tangentType = layer.transform.rotation[j][2];
						var time = layer.transform.rotation[j][0] * frameDuration;
						var value = 360 - layer.transform.rotation[j][1];
						var delta = value - lastValue;
						var steps = Math.floor(Math.abs(delta) / 180) + 1;
						var dt = (time - lastTime) / steps;
						delta /= steps;
						for (var k=1; k<=steps; k++) {
							var keyData = {
								"time": lastTime + (dt * k),
								"angle": (lastValue + (delta * k)) % 360
							};
							if (tangentType == "hold") {
								keyData["curve"] = "stepped";
							}
							rotateTimeline.push( keyData );
						}
						lastValue = value;
						lastTime = time;
					}
					if (!boneAnimData[boneName]) boneAnimData[boneName] = {};
					boneAnimData[boneName]["rotate"] = rotateTimeline;
				}
			}
		}
		return boneAnimData;
	}

	AE2JSON.prototype.generateSpineData = function() {
		var layers = this.defaultComp.layers;
		var numLayers = layers.length;
		var bonesData = this.generateSpineBones();
		var slotsData = this.generateSpineSlots();
		var skinsData = this.generateSpineSkins();
		var boneAnimData = this.generateSpineBoneAnimations();
		var slotAnimData = this.generateSpineSlotAnimations();
		var spineData = {
			"bones": bonesData,
			"slots": slotsData,
			"skins": skinsData,
			"animations": {
				"animation": {
					"bones": boneAnimData,
					"slots": slotAnimData
				}
			}
		};
		return spineData;
	}


	AE2JSON.prototype.renderJSON = function(toFile) {
		var projectName, compName, filename, jsonExportFile, jsonString;
		// create JSON file.
		projectName = app.project.file.name.replace(".aep", '');
		compName    = app.project.activeItem.name;
		fileName    = projectName + "_"+ compName + ".json";
		fileName    = fileName.replace(/\s/g, '');

		var path = app.project.file.parent.absoluteURI + "/";
		var fullPath = path + fileName;

		
		// this.addMatrixData();
		// this.jsonData = this.generateBCGAnimationData();

		jsonString = JSON.stringify(this.jsonData, null, "\t");
		if (toFile == true) {
			delete this.jsonData;
			jsonExportFile = new File(fullPath);
			jsonExportFile.open("w");
			jsonExportFile.write(jsonString);
			jsonExportFile.close();
			// alert("Saved "+fullPath);
		}
	}




	function CompSettings(compObj){
		this.name          = compObj.name;
		this.width         = compObj.width;
		this.height        = compObj.height;
		this.frameRate     = compObj.frameRate;
		this.frameDuration = compObj.frameDuration;
		this.duration      = compObj.duration;

		return this;
	}




	function BaseObject(compSettings, layer){
		// Do not store layer, it's too big and can cause a stack overflow
		this.objData = {};
		this.beforeDefaults(compSettings, layer);
		this.setDefaults(compSettings, layer);
		this.afterDefaults(compSettings, layer);
	}

	BaseObject.prototype.beforeDefaults = function(compSettings, layer){
		return true;
	}

	BaseObject.prototype.afterDefaults = function(compSettings, layer){
		return true;
	}

	BaseObject.prototype.setDefaults = function(compSettings, layer){
		// add _L + the layer index to make sure names are unique
		this.objData.name  = this.createName(layer.name, layer.index);
		this.objData.index = layer.index;
		this.objData.inPoint = layer.inPoint;
		this.objData.outPoint = layer.outPoint;
		if (this.objData.inPoint > this.objData.outPoint) {
			var temp = this.objData.inPoint;
			this.objData.inPoint = this.objData.outPoint;
			this.objData.outPoint = temp;
		}
		this.objData.compSettings = compSettings;
		this.compSettings  = compSettings;
		this.setPropGroups();
		this.doProps(layer); 
	}

	BaseObject.prototype.createName = function(name, index){
		return name + "_L" + index;
	}

	BaseObject.prototype.setPropGroups = function(){
		this.propGroups = ["transform"];
	}

	BaseObject.prototype.doProps = function(layer){
		var i, j, hasParent, parentLayer, numPropGroups, propGroup, groupName, group, propName, prop, visible;

		numPropGroups = this.propGroups.length;

		hasParent = false;

		if(layer.parent != null){
			hasParent = true;
			parentLayer = layer.parent;
			this.objData.parent = parentLayer.index; //this.createName(parentLayer.name, parentLayer.index);
			//layer.parent = null;
		}else{
			this.objData.parent = 0;
		}

		for(i=0; i<numPropGroups; i++){
			groupName = this.propGroups[i];
			group     = this.objData[groupName] = {};
			propGroup = layer[groupName];

			if (propGroup.numProperties != undefined ) {
				for (j = 1; j < propGroup.numProperties; j++){
					visible = true;
					try{
						propGroup.property(j).selected = true;
					}catch (err){
						visible = false;
					}
					if (visible) {
						prop = propGroup.property(j);
						propName = prop.name;
						propName = propName.toCamelCase();
						group[propName] = this.setPropValues(prop);
					}
				}
			} else {
				this.objData[groupName] = this.setPropValues(propGroup);
			}
		}
		//if(hasParent){layer.parent = parentLayer};
	}

	BaseObject.prototype.setPropValues = function(prop){
		var duration = this.compSettings.duration;
		var frameDuration = this.compSettings.frameDuration;
		var frameRate = this.compSettings.frameRate;
		var timeSampleRate = 1.0/(frameRate*1);	//1.0/60.0;
		var tollerance = 1/15.0;	// <-- Smaller numbers produce more intermediate keyframes

		var timeValues = new Array();
		if(prop.numKeys > 1){
			for(keyIndex = 1; keyIndex <= prop.numKeys; keyIndex++){
				var keyTime = prop.keyTime(keyIndex);
				var frame = keyTime / frameDuration;
				var propVal = prop.keyValue(keyIndex);
				var interpolation = prop.keyOutInterpolationType(keyIndex);
				var keyData = [frame, propVal];
				if (interpolation == KeyframeInterpolationType.HOLD) {
					keyData.push("hold");
					timeValues.push(keyData);
				} else {
					if (prop.isSpatial) {
						keyData.push("linear");
						timeValues.push(keyData);
						if (keyIndex <= prop.numKeys-1) {
							var nextPropVal = prop.keyValue(keyIndex+1);
							var nextKeyTime = prop.keyTime(keyIndex+1);
							var distance = dist( propVal, nextPropVal );
							var steps = (nextKeyTime - keyTime) / timeSampleRate;
							var dx = (nextPropVal[0] - propVal[0]) / steps;
							var dy = (nextPropVal[1] - propVal[1]) / steps;
							propVal = propVal.slice(0);	//clone
							var time = keyTime;
							for ( var i=1; i<steps; i++ ) {
								time+=timeSampleRate;
								propVal[0] += dx;
								propVal[1] += dy;
								var interVal = prop.valueAtTime(time, true);
								var interDist = dist( interVal, propVal );
								var intollerable = (interDist > distance*tollerance);
								if (intollerable) {
									propVal = interVal.slice(0);	//clone
									//distance = dist( propVal, nextPropVal );
									dx = (nextPropVal[0] - propVal[0]) / (steps-i);
									dy = (nextPropVal[1] - propVal[1]) / (steps-i);
									keyData = [time/frameDuration, propVal.slice(0), "linear"];
									timeValues.push(keyData);
								}
							}
						}
					} else {
						if (interpolation == KeyframeInterpolationType.LINEAR) {
							keyData.push("linear");
						} else if (interpolation == KeyframeInterpolationType.BEZIER) {
							keyData.push("linear");
							// keyData.push("bezier");
							// var easeIn = prop.keyInSpatialEase(keyIndex);
							// keyData.push(easeIn[0]);
							// var easeOut = prop.keyOutSpatialEase(keyIndex);
							// keyData.push(easeOut[0]);
						}
						timeValues.push(keyData);
					}
				}
			}
		} else {
			timeValues.push([0, prop.value, "hold"]);
		}

		// } else {
		// 	startFrame = 0; //Number(timeToCurrentFormat(firstKeyTime, frameRate));
		// 	endFrame   = Math.floor(duration / frameDuration)-1;	//Number(timeToCurrentFormat(lastKeyTime, frameRate));

		// 	for(frame = startFrame; frame <= endFrame; frame++){
		// 		time = frame * frameDuration;
		// 		propVal = prop.valueAtTime(time, false);
		// 		timeValues.push([frame, propVal]);
		// 		//timeValues.push([time, propVal]);
		// 	}
		// }
		
		return timeValues;
	}

	


	Null.prototype = Object.create(BaseObject.prototype);
	function Null(compSettings, layer){
		BaseObject.call(this, compSettings, layer);
		return this.objData;
	}

	Null.prototype.beforeDefaults = function(compSettings, layer){
		this.objData.layerType = "Null";
	}
	


	AV.prototype = Object.create(BaseObject.prototype);
	function AV(compSettings, layer){
		BaseObject.call(this, compSettings, layer);
		return this.objData;
	}

	AV.prototype.beforeDefaults = function(compSettings, layer){
		this.objData.layerType = "AV";
		this.objData.width = layer.width;
		this.objData.height = layer.height;
		this.objData.enabled = layer.enabled;
		this.objData.blendingMode = layer.blendingMode;
		if( layer.source.mainSource && layer.source.mainSource.file && !layer.source.mainSource.isStill ) {
			var sourceFilename = layer.source.mainSource.file.toString();
			var baseName = sourceFilename.replace(/^(.*?)[0-9]+\.png$/,"$1");
			var dirName = sourceFilename.replace(/^(.*\/)[^\/]+\.png$/,"$1");
			var baseDirName = dirName.substr(dirName.indexOf("-assets")+8);
			var matchName = baseName.replace(dirName,"") + "*.png";
			var dir = new Folder(dirName);
			this.objData.frameRate = layer.source.frameRate;
			this.objData.files = new Array();
			var files = dir.getFiles(matchName);
			var numFiles = files.length;
			for (var i=0; i<numFiles; ++i) {
				var name = baseDirName + files[i].name;
				this.objData.files.push( name );
			}
		}
		if (layer.source instanceof CompItem) {
			this.objData.comp = layer.source.name;
		} else {
			this.objData.comp = null;
		}
	}
	
	AV.prototype.afterDefaults = function(compSettings, layer){
		if (layer["timeRemapEnabled"]) {
			var duration      = this.compSettings.duration;
			var frameDuration = this.compSettings.frameDuration;
			var frameRate     = this.compSettings.frameRate;

			var startFrame = 0; //Number(timeToCurrentFormat(firstKeyTime, frameRate));
			var endFrame   = Math.floor(duration / frameDuration)-1;	//Number(timeToCurrentFormat(lastKeyTime, frameRate));

			// The time remap keyframe values only
			this.objData["timeRemap"] = this.setPropValues( layer["timeRemap"] );
			var len = this.objData["timeRemap"].length;
			this.objData["timeRemap"].sort( function(a,b) { return a[0] < b[0] ? -1 : 1; });
			for (var i=0; i<len; i++) {
				var frame = this.objData["timeRemap"][i][0];
				time = Math.round( frame ) * frameDuration;
				this.objData["timeRemap"][i][0] = time;
				var value = this.objData["timeRemap"][i][1];
				value = Math.round(value * layer.source.frameRate);
				this.objData["timeRemap"][i][1] = value;
			}
		}
	}


	ShapeObj.prototype = Object.create(BaseObject.prototype);
	function ShapeObj(compSettings, layer){
		BaseObject.call(this, compSettings, layer);
		return this.objData;
	}

	ShapeObj.prototype.beforeDefaults = function(compSettings, layer){
		this.objData.layerType = "Shape";
		this.objData.width = layer.width;
		this.objData.height = layer.height;
		this.objData.blendingMode = layer.blendingMode;
	}

	new AE2JSON(this,true);
}
