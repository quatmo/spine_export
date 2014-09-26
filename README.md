Spine Export Scripts
====================

Scripts to export Adobe Photoshop and After Effects content to Esoteric Software's Spine animation tool JSON format.
Migrate Spine data
-------------------------
Starting with Spine version 2.0, the way that scale timeline values are computed changed.  This python script updates any spine json file below version 2.0.0 and regenerates the scale timelines.  Currently, it does not preserve the pretty formatting that Spine outputs.  The script is designed to accomodate additional migrations in the future.  The script can be run multiple times without ill effect.

***Note on Zero-Scale bones***: Bones with a zero for scale will use 0.001 as their scale, and the scale timeline will be adjusted accordingly.  If the bone itself has zero for scale, nothing on the timeline can affect it.


After Effects Export with ae_to_spine.jsx
-------------------------
The ae_to_spine.jsx script exports a lot of animation data from After Effects, but not everything.  Things that are supported:

* Image layers
* PNG sequence layers
* Layer hierarchy (parenting)
* Translation, rotation, scale, opacity keyframes (as linear)
* Composition layers (nested compositions)
* Per-layer in-point and out-point (visibility)
* Time remapping
* Additive blend mode

Things that are not supported:

* Warp effects, puppet animation, etc. (no deformation)
* Glows, shadows, etc. (no effects)
* Masks of any kind
* Color transformations of any kind
* Plugin effects, like particles, etc.

Some of these limitations are easier to work around than others.  For example, if you are warping an image, consider rendering out the warping animation to a PNG sequence and using that as a layer.

For particle effects, render those out as a separate PNG sequence as well.  Use a lower resolution if you can to save texture space.

Same goes for glows, shadows, and other effects. They can be rendered out, added as another layer, and faded in and out using opacity, often at lower resolution.

Photoshop Export with psd_to_spine.jsx
-------------------------
There is an official photoshop export script from Esoteric Software.  This one was written mainly to work with the new Photoshop CC 2013 [image generator](http://blogs.adobe.com/photoshopdotcom/2013/09/introducing-adobe-generator-for-photoshop-cc.html) feature.

psd_to_spine.jsx only exports layers that are named with ".png" in their name.  It takes into account any declared scale, if there is one.  For example, "25% foo.png" will use write out a PNG that is 25% of the layer size, but add "scaleX": 4.0, "scaleY": 4.0 to the Spine JSON output.

psd_to_spine.jsx also exports Groups as bones, and uses relative positions for the layers within the Group/bone.

The following Layer attributes are exported:

* x, y, width, height
* scale as declared in the Layer name
* opacity
* additive blend mode

Some notable things that aren't supported:

* rotation  (Even for smart objects, this just isn't something that's accessible through scripting)
* blend modes other than "additive".  (Would love for Spine to support more!)
* Eliminating duplicate images

Regarding duplicate or mirrored images, the workflow we've adopted is to use duplcated and/or mirrored objects all we want in Photoshop, but once we export for Spine, edit the JSON and replace all duplicate image references with a single image reference.  Various texture packer or atlas generators can do this job as well.  The point is, look for opportunities to re-use the same texture in Spine if possible.

Support
-------
If you run into something that should work but doesn't, please submit an issue on [github](https://github.com/Bee-Cave-Games/spine_export)




