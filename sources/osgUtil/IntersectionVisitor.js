import utils from 'osg/utils';
import NodeVisitor from 'osg/NodeVisitor';
import { mat4 } from 'osg/glMatrix';
import PooledResource from 'osg/PooledResource';
import PooledArray from 'osg/PooledArray';
import TransformEnums from 'osg/transformEnums';

var IntersectionVisitor = function () {
    NodeVisitor.call(this);
    // We could need to use a stack of intersectors in case we want
    // to use several intersectors. Right now we use only one.
    this._intersector = undefined;

    this._projectionStack = new PooledArray();
    this._modelStack = new PooledArray();
    this._viewStack = new PooledArray();
    this._windowStack = new PooledArray();
    this._pooledMatrix = new PooledResource(mat4.create);

    this.reset();
};

utils.createPrototypeObject(
    IntersectionVisitor,
    utils.objectInherit(NodeVisitor.prototype, {
        reset: function () {
            this._pooledMatrix.reset();
            this._viewStack.reset();
            this._modelStack.reset();
            this._projectionStack.reset();
            this._windowStack.reset();

            this._viewStack.push(mat4.IDENTITY);
            this._modelStack.push(mat4.IDENTITY);
            this._projectionStack.push(mat4.IDENTITY);
            this._windowStack.push(mat4.IDENTITY);
        },
        setIntersector: function (intersector) {
            this._intersector = intersector;
        },
        getIntersector: function () {
            return this._intersector;
        },
        // Model matrix
        pushModelMatrix: function (matrix) {
            this._modelStack.push(matrix);
        },
        getModelMatrix: function () {
            return this._modelStack.back();
        },
        popModelMatrix: function () {
            return this._modelStack.pop();
        },
        // View Matrix
        pushViewMatrix: function (matrix) {
            this._viewStack.push(matrix);
        },
        getViewMatrix: function () {
            return this._viewStack.back();
        },
        popViewMatrix: function () {
            return this._viewStack.pop();
        },
        // Projection Matrix
        pushProjectionMatrix: function (matrix) {
            this._projectionStack.push(matrix);
        },
        getProjectionMatrix: function () {
            return this._projectionStack.back();
        },
        popProjectionMatrix: function () {
            return this._projectionStack.pop();
        },
        // Window Matrix
        pushWindowMatrix: function (matrix) {
            this._windowStack.push(matrix);
        },
        pushWindowMatrixUsingViewport: function (viewport) {
            this._windowStack.push(
                viewport.computeWindowMatrix(this._pooledMatrix.getOrCreateObject())
            );
        },
        getWindowMatrix: function () {
            return this._windowStack.back();
        },
        popWindowMatrix: function () {
            return this._windowStack.pop();
        },
        getTransformation: (function () {
            // We should move this to the intersector when we need to use different coordinate frames
            // Now we only support WINDOW coordinate frame

            // /!\ 64 bit precision because the picking is jittery otherwise
            // It's probably caused by one of the camera matrix that has too big/small values
            // but currently it's the ony fix we have
            var mat = mat4.create64();

            return function () {
                mat4.copy(mat, this.getWindowMatrix());
                mat4.mul(mat, mat, this.getProjectionMatrix());
                mat4.mul(mat, mat, this.getViewMatrix());
                mat4.mul(mat, mat, this.getModelMatrix());

                return mat;
            };
        })(),

        enter: function (node) {
            // Call to each intersector
            return this._intersector.enter(node);
        },

        apply: function (node) {
            // Here we need to decide which apply method to use
            if (node.getViewMatrix) {
                // It's a Camera
                this.applyCamera(node);
            } else {
                if (node.getMatrix) {
                    // It's a Transform Node
                    this.applyTransform(node);
                } else {
                    // It's a leaf or an intermediate node
                    this.applyNode(node);
                }
            }
        },

        applyCamera: function (camera) {
            // We use an absolute reference frame for simplicity
            var vp = camera.getViewport();
            if (vp !== undefined) {
                this.pushWindowMatrixUsingViewport(vp);
            }

            var projection, view, model;
            if (
                camera.getReferenceFrame() === TransformEnums.RELATIVE_RF &&
                this.getViewMatrix() &&
                this.getProjectionMatrix()
            ) {
                // relative
                projection = mat4.mul(
                    this._pooledMatrix.getOrCreateObject(),
                    this.getProjectionMatrix(),
                    camera.getProjectionMatrix()
                );
                view = this.getViewMatrix();
                model = mat4.mul(
                    this._pooledMatrix.getOrCreateObject(),
                    this.getModelMatrix(),
                    camera.getViewMatrix()
                );
            } else {
                // absolute
                projection = camera.getProjectionMatrix();
                view = camera.getViewMatrix();
                model = mat4.identity(this._pooledMatrix.getOrCreateObject());
            }

            this.pushProjectionMatrix(projection);
            this.pushViewMatrix(view);
            this.pushModelMatrix(model);

            // TODO maybe we should do something like OSG for the transformation given
            // to the intersector (having a stack)
            this._intersector.setCurrentTransformation(this.getTransformation());
            this.traverse(camera);

            this.popModelMatrix();
            this.popViewMatrix();
            this.popProjectionMatrix();
            if (vp !== undefined) {
                this.popWindowMatrix();
            }
            this._intersector.setCurrentTransformation(this.getTransformation());
        },

        applyNode: function (node) {
            if (!this.enter(node)) return;
            // As this part of the code is potentially executed a lot of times we don't use instanceof
            // https://jsperf.com/instanceof-performance/25
            if (node.getPrimitiveSetList) {
                this._intersector.intersect(this, node);
                // If it is a leaf (it has primitives) we can safely return
                return;
            }
            if (node.traverse) {
                this.traverse(node);
            }
        },

        applyTransform: function (node) {
            // Now only use PROJECTION coordinate frame
            if (!this.enter(node)) return;
            // Accumulate Transform
            if (node.getReferenceFrame() === TransformEnums.ABSOLUTE_RF) {
                var matrix = this._pooledMatrix.getOrCreateObject();
                this.pushViewMatrix(mat4.identity(matrix));
                this.pushModelMatrix(node.getMatrix());
            } else if (this._modelStack.getLength() > 0) {
                var m = mat4.copy(this._pooledMatrix.getOrCreateObject(), this.getModelMatrix());
                mat4.mul(m, m, node.getMatrix());
                this.pushModelMatrix(m);
            } else {
                this.pushModelMatrix(node.getMatrix());
            }

            // TODO see above
            this._intersector.setCurrentTransformation(this.getTransformation());
            this.traverse(node);

            this.popModelMatrix();
            if (node.getReferenceFrame() === TransformEnums.ABSOLUTE_RF) this.popViewMatrix();
            this._intersector.setCurrentTransformation(this.getTransformation());
        }
    }),
    'osgUtil',
    'IntersectionVisitor'
);

export default IntersectionVisitor;
