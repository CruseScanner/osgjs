import { assert } from 'chai';
import Utils from 'osg/utils';
import State from 'osg/State';
import StateSet from 'osg/StateSet';
import Material from 'osg/Material';
import StateAttribute from 'osg/StateAttribute';
import Texture from 'osg/Texture';
import ShaderGeneratorProxy from 'osgShader/ShaderGeneratorProxy';
import mockup from 'tests/mockup/mockup';

export default function () {
    test('State', function () {
        (function () {
            var state = new State(new ShaderGeneratorProxy());

            var stateSet0 = new StateSet();
            var stateSet1 = new StateSet();
            var stateSet2 = new StateSet();

            var material = new Material();
            stateSet0.setAttributeAndModes(material);
            stateSet1.setAttributeAndModes(new Material(), StateAttribute.OVERRIDE);
            stateSet2.setAttributeAndModes(new Material(), StateAttribute.OFF);

            state.pushStateSet(stateSet0);
            state.pushStateSet(stateSet1);
            state.pushStateSet(stateSet2);
            var materialStack =
                state._attributeArray[Utils.getOrCreateStateAttributeTypeMemberIndex(material)];
            assert.isOk(
                materialStack[materialStack.getLength() - 1] ===
                    materialStack[materialStack.getLength() - 2],
                'check Override in state'
            );
        })();
    });

    test('State setGlobalDefaultTextureAttribute', function () {
        var state = new State(new ShaderGeneratorProxy());

        var texture = new Texture();
        state.setGlobalDefaultTextureAttribute(0, texture);

        assert.equal(
            state.getGlobalDefaultTextureAttribute(0, 'Texture'),
            texture,
            'check texture object'
        );
    });

    test('State applyStateSet', function () {
        (function () {
            var state = new State(new ShaderGeneratorProxy());
            var fakeRenderer = mockup.createFakeRenderer();
            var id = 0;
            fakeRenderer.createProgram = function () {
                return id++;
            };
            fakeRenderer.getProgramParameter = function () {
                return true;
            };

            var textureBindCall = new Map();

            fakeRenderer.bindTexture = function (target, texture) {
                var value = textureBindCall.get(texture);
                if (value === undefined) value = 0;
                value++;
                textureBindCall.set(texture, value);
            };
            state.setGraphicContext(fakeRenderer);

            var stateSet0 = new StateSet();
            var stateSet1 = new StateSet();
            var stateSet2 = new StateSet();

            stateSet0.setAttributeAndModes(new Material());

            var texture0 = new Texture();
            texture0.setName('My name is 0');
            texture0.setTextureSize(1, 1);
            texture0._textureObject = {
                bind: function (gl) {
                    gl.bindTexture(0, 1);
                }
            };

            stateSet1.setTextureAttributeAndModes(0, texture0);

            stateSet2.setTextureAttributeAndModes(0, texture0);
            stateSet2.setTextureAttributeAndModes(1, new Texture());

            state.pushStateSet(stateSet0);
            state.applyStateSet(stateSet1);
            state.applyStateSet(stateSet2);

            assert.equal(state.getStateSetStackSize(), 1, 'check stateSet stack length');
            var program = state.getLastProgramApplied();
            assert.notEqual(program, undefined, 'check last program applied');
            assert.equal(state._programAttribute.getLength(), 0, 'check program stack length');

            // check that texture 0 is applied only once
            assert.equal(textureBindCall.get(1), 1, 'check that texture 0 is applied only once');
        })();
    });
}
