import utils from 'osg/utils';
import { vec3 } from 'osg/glMatrix';
import { mat4 } from 'osg/glMatrix';
import Manipulator from 'osgGA/Manipulator';
import OrbitManipulatorDeviceOrientationController from 'osgGA/OrbitManipulatorDeviceOrientationController';
import OrbitManipulatorGamePadController from 'osgGA/OrbitManipulatorGamePadController';
import OrbitManipulatorHammerController from 'osgGA/OrbitManipulatorHammerController';
import OrbitManipulatorStandardMouseKeyboardController from 'osgGA/OrbitManipulatorStandardMouseKeyboardController';
import OrbitManipulatorWebVRController from 'osgGA/OrbitManipulatorWebVRController';
import DelayInterpolator from 'osgUtil/DelayInterpolator';
import Groups from 'osgViewer/input/InputConstants';

/**
 *  OrbitManipulator
 *  @class
 */
var OrbitManipulator = function (options) {
    Manipulator.call(this, options);
    this._homePosition = vec3.create();
    this._frustum = {};
    this.init();
};

OrbitManipulator.AvailableControllerList = [
    'StandardMouseKeyboard',
    'GamePad',
    'Hammer',
    'DeviceOrientation',
    'WebVR'
];

OrbitManipulator.ControllerList = [
    'StandardMouseKeyboard',
    'GamePad',
    'Hammer',
    'DeviceOrientation',
    'WebVR'
];

var TWO_PI = 2 * Math.PI;
var lowerOrEqual = function (val, limit) {
    return val < limit + 0.00001;
};

var MIN_ZOOM = 1e-4;
var MAX_ZOOM = Infinity;

/** @lends OrbitManipulator.prototype */
utils.createPrototypeObject(
    OrbitManipulator,
    utils.objectInherit(Manipulator.prototype, {
        init: function () {
            this._distance = 25.0;
            this._target = vec3.create();
            this._upz = vec3.fromValues(0.0, 0.0, 1.0);
            vec3.init(this._target);

            var rot1 = mat4.fromRotation(mat4.create(), -Math.PI, this._upz);
            var rot2 = mat4.fromRotation(
                mat4.create(),
                Math.PI / 10.0,
                vec3.fromValues(1.0, 0.0, 0.0)
            );
            this._rotation = mat4.create();
            mat4.mul(this._rotation, rot1, rot2);
            this._time = 0.0;

            this._vrMatrix = mat4.create();

            this._rotate = new DelayInterpolator(2);
            this._pan = new DelayInterpolator(2);
            this._zoom = new DelayInterpolator(1);

            this._minSpeed = 1e-4; // set a limit to pan/zoom speed
            this._scaleMouseMotion = 1.0;

            this._inverseMatrix = mat4.create();

            // distance at which we start pushing the target (so that we can still zoom)
            // with a very low _limitZoomIn, it's like a fps manipulator as long as you don't unzoom
            this._autoPushTarget = true;

            // pitch range [-PI/2, PI/2]
            this._limitPitchUp = Math.PI * 0.5 * 0.9;
            this._limitPitchDown = -this._limitPitchUp;

            // yaw range [-PI, PI]
            this._limitYawLeft = -Math.PI;
            this._limitYawRight = -this._limitYawLeft;

            this._limitZoomIn = MIN_ZOOM;
            this._limitZoomOut = MAX_ZOOM;

            this._constrainYaw = false;
            this._constrainPitch = false;
            this._constrainYaw = false;
            this._constrainZoom = false;

            // instance of controller
            var self = this;

            OrbitManipulator.ControllerList.forEach(function (value) {
                if (OrbitManipulator[value] !== undefined) {
                    if (self._controllerList[value]) {
                        self._controllerList[value].init();
                    } else {
                        self._controllerList[value] = new OrbitManipulator[value](self);
                    }
                }
            });
        },
        setLimitPitchUp: function (up) {
            this._limitPitchUp = up;
        },
        setLimitPitchDown: function (down) {
            this._limitPitchDown = down;
        },
        setLimitYawLeft: function (left) {
            this._limitYawLeft = left;
            this._constrainYaw = true;
        },
        setLimitYawRight: function (right) {
            this._limitYawRight = right;
            this._constrainYaw = true;
        },
        setLimitZoomOut: function (zoomOut) {
            this._limitZoomOut = zoomOut;
            this._constrainZoom = true;
        },
        setLimitZoomIn: function (zoomIn) {
            this._limitZoomIn = zoomIn;
            this._constrainZoom = true;
        },

        setConstrainPitch: function (limit) {
            this._constrainPitch = limit;
            this._previousPitch = undefined;
        },

        isConstrainPitch: function () {
            return this._constrainPitch;
        },

        setConstrainYaw: function (constrain) {
            this._constrainYaw = constrain;
            this._previousYaw = undefined;
        },

        isConstrainYaw: function () {
            return this._constrainYaw;
        },

        setConstrainZoom: function (limit) {
            this._constrainZoom = limit;
        },

        isConstrainZoom: function () {
            return this._constrainZoom;
        },

        setDelay: function (dt) {
            this._rotate.setDelay(dt);
            this._pan.setDelay(dt);
            this._zoom.setDelay(dt);
        },
        reset: function () {
            this.init();
        },
        setTarget: function (target) {
            vec3.copy(this._target, target);
            var eyePos = vec3.create();
            this.getEyePosition(eyePos);
            this._distance = vec3.distance(target, eyePos);
        },
        setEyePosition: (function () {
            var f = vec3.create();
            var s = vec3.create();
            var u = vec3.create();
            return function (eye) {
                var result = this._rotation;
                var center = this._target;

                vec3.sub(f, eye, center);
                vec3.normalize(f, f);

                vec3.cross(s, f, this._upz);
                vec3.normalize(s, s);

                vec3.cross(u, s, f);
                vec3.normalize(u, u);

                // s[0], f[0], u[0], 0.0,
                // s[1], f[1], u[1], 0.0,
                // s[2], f[2], u[2], 0.0,
                // 0,    0,    0,     1.0
                result[0] = s[0];
                result[1] = f[0];
                result[2] = u[0];
                result[3] = 0.0;
                result[4] = s[1];
                result[5] = f[1];
                result[6] = u[1];
                result[7] = 0.0;
                result[8] = s[2];
                result[9] = f[2];
                result[10] = u[2];
                result[11] = 0.0;
                result[12] = 0;
                result[13] = 0;
                result[14] = 0;
                result[15] = 1.0;

                this._distance = vec3.distance(center, eye);
            };
        })(),

        setEnable: function (enabled) {
            this.getInputManager().setEnable(Groups.ORBIT_MANIPULATOR, enabled);
        },

        computeHomePosition: function (boundStrategy) {
            var bs = this.getHomeBoundingSphere(boundStrategy);
            if (!bs || !bs.valid()) return;

            this.setDistance(this.getHomeDistance(bs));
            this.setTarget(bs.center());
        },

        getHomePosition: function () {
            if (this._node !== undefined) {
                var target = this._target;
                var distance = this.getDistance();

                this.computeEyePosition(target, distance, this._homePosition);
            }
            return this._homePosition;
        },

        setMinSpeed: function (s) {
            this._minSpeed = s;
        },
        getMinSpeed: function () {
            return this._minSpeed;
        },

        setDistance: function (d) {
            this._distance = d;
        },
        getDistance: function () {
            return this._distance;
        },

        getSpeedFactor: function () {
            return Math.max(this._distance, this._minSpeed);
        },
        computePan: (function () {
            var inv = mat4.create();
            var x = vec3.create();
            var y = vec3.create();
            return function (dx, dy) {
                var proj = this._camera.getProjectionMatrix();
                // modulate panning speed with verticalFov value
                // if it's an orthographic we don't change the panning speed
                // TODO : manipulators in osgjs don't support well true orthographic camera anyway because they
                // manage the view matrix (and you need to edit the projection matrix to 'zoom' for true ortho camera)
                var vFov = proj[15] === 1 ? 1.0 : 2.0 / proj[5];
                var speed = this.getSpeedFactor() * vFov;
                dy *= speed;
                dx *= speed;

                mat4.invert(inv, this._rotation);
                x[0] = inv[0];
                x[1] = inv[1];
                x[2] = inv[2];
                vec3.normalize(x, x);

                y[0] = inv[8];
                y[1] = inv[9];
                y[2] = inv[10];
                vec3.normalize(y, y);

                vec3.scale(x, x, -dx);
                vec3.scale(y, y, dy);
                vec3.add(this._target, this._target, x);
                vec3.add(this._target, this._target, y);
            };
        })(),
        computeRotation: (function () {
            var rightDir = vec3.fromValues(1.0, 0.0, 0.0);

            return function (dx, dy) {
                var prevPitch = Math.atan(-this._rotation[6] / this._rotation[5]);
                if (isNaN(prevPitch)) {
                    prevPitch = 0.0;
                }
                var pitch = this._computePitch(prevPitch, dy);

                var deltaYaw = dx / 10.0;
                var previousYaw = Math.atan2(this._rotation[4], this._rotation[0]);
                var yaw = this._computeYaw(previousYaw, deltaYaw);
                mat4.fromRotation(this._rotation, -pitch, rightDir);
                mat4.rotate(this._rotation, this._rotation, -yaw, this._upz);
            };
        })(),

        _computePitch: function (prevPitch, dy) {
            var pitch = prevPitch + dy / 10.0;
            return Math.min(Math.max(pitch, this._limitPitchDown), this._limitPitchUp);
        },

        _computeYaw: function (previousYaw, deltaYaw) {
            var yaw = previousYaw + deltaYaw;
            var left = this._limitYawLeft;
            var right = this._limitYawRight;

            if (this._constrainYaw) {
                if (right < left) {
                    if (yaw > Math.PI) {
                        previousYaw -= TWO_PI;
                        yaw -= TWO_PI;
                    }
                    if (yaw < -Math.PI) {
                        previousYaw += TWO_PI;
                        yaw += TWO_PI;
                    }
                }

                if (deltaYaw === 0) {
                    var isOutsideLimit = false;
                    if (left > right) isOutsideLimit = yaw < left && yaw > right;
                    else isOutsideLimit = yaw < left || yaw > right;
                    if (isOutsideLimit)
                        yaw = Math.abs(yaw - left) > Math.abs(yaw - right) ? right : left;
                }

                if (deltaYaw > 0.0 && lowerOrEqual(previousYaw, right) && yaw > right) {
                    yaw = right;
                } else if (deltaYaw < 0.0 && lowerOrEqual(left, previousYaw) && yaw < left) {
                    yaw = left;
                }
            }
            return yaw;
        },

        computeZoom: function (dz) {
            this.zoom(dz);
        },

        setAutoPushTarget: function (bool) {
            this._autoPushTarget = bool;
        },

        zoom: (function () {
            var dir = vec3.create();
            return function (ratio) {
                var newValue = this._distance + this.getSpeedFactor() * (ratio - 1.0);

                if (this._autoPushTarget && newValue < this._limitZoomIn) {
                    // push the target instead of zooming on it
                    vec3.sub(dir, this._target, this.getEyePosition(dir));
                    vec3.normalize(dir, dir);
                    vec3.scale(dir, dir, this._limitZoomIn - newValue);
                    vec3.add(this._target, this._target, dir);
                }

                var min = this._constrainZoom ? this._limitZoomIn : MIN_ZOOM;
                var max = this._constrainZoom ? this._limitZoomOut : MAX_ZOOM;
                this._distance = Math.max(min, Math.min(max, newValue));
            };
        })(),

        getRotateInterpolator: function () {
            return this._rotate;
        },
        getPanInterpolator: function () {
            return this._pan;
        },
        getZoomInterpolator: function () {
            return this._zoom;
        },
        getTarget: function (target) {
            return vec3.copy(target, this._target);
        },
        getEyePosition: function (eye) {
            this.computeEyePosition(this._target, this._distance, eye);
            return eye;
        },

        computeEyePosition: (function () {
            var tmpDist = vec3.create();
            var tmpInverse = mat4.create();
            return function (target, distance, eye) {
                mat4.invert(tmpInverse, this._rotation);
                tmpDist[1] = distance;
                vec3.transformMat4(eye, tmpDist, tmpInverse);
                vec3.add(eye, target, eye);
            };
        })(),

        update: (function () {
            var eye = vec3.create();
            return function (nv) {
                var dt = nv.getFrameStamp().getDeltaTime();

                var delta;
                var mouseFactor = 0.1;
                delta = this._rotate.update(dt);
                this.computeRotation(
                    -delta[0] * mouseFactor * this._scaleMouseMotion,
                    -delta[1] * mouseFactor * this._scaleMouseMotion
                );

                var panFactor = 0.002;
                delta = this._pan.update(dt);
                this.computePan(-delta[0] * panFactor, -delta[1] * panFactor);

                delta = this._zoom.update(dt);
                this.computeZoom(1.0 + delta[0] / 10.0);

                var target = this._target;
                var distance = this._distance;

                /* 1. Works but bypass other manipulators */
                // mat4.copy( this._inverseMatrix , this._vrMatrix );

                /* 2. Works but gets broken by other manipulators */
                mat4.invert(this._inverseMatrix, this._rotation);
                mat4.mul(this._inverseMatrix, this._vrMatrix, this._inverseMatrix);

                /* 3. Doesnt' work */
                // mat4.mul( this._vrMatrix,  this._vrMatrix, this._rotation );
                // mat4.invert( this._inverseMatrix, this._vrMatrix );

                vec3.set(eye, 0.0, distance, 0.0);
                vec3.transformMat4(eye, eye, this._inverseMatrix);

                mat4.lookAt(this._inverseMatrix, vec3.add(eye, target, eye), target, this._upz);
            };
        })(),

        setPoseVR: function (q /*, pos*/) {
            mat4.fromQuat(this._vrMatrix, q);
            // this._vrMatrix[ 12 ] = pos[ 0 ];
            // this._vrMatrix[ 13 ] = pos[ 1 ];
            // this._vrMatrix[ 14 ] = pos[ 2 ];
        }
    }),
    'osgGA',
    'OrbitManipulator'
);

OrbitManipulator.DeviceOrientation = OrbitManipulatorDeviceOrientationController;
OrbitManipulator.GamePad = OrbitManipulatorGamePadController;
OrbitManipulator.Hammer = OrbitManipulatorHammerController;
OrbitManipulator.WebVR = OrbitManipulatorWebVRController;
OrbitManipulator.StandardMouseKeyboard = OrbitManipulatorStandardMouseKeyboardController;

export default OrbitManipulator;
