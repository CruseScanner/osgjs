define( [
    'osg/Utils',
    'osg/StateAttribute'
], function ( MACROUTILS, StateAttribute ) {

    var BillboardAttribute = function () {
        StateAttribute.call( this );
        this._attributeEnable = true;
    };

    BillboardAttribute.prototype = MACROUTILS.objectLibraryClass( MACROUTILS.objectInherit( StateAttribute.prototype, {
        attributeType: 'Billboard',

        cloneType: function () {
            return new BillboardAttribute();
        },

        setEnabled: function ( state ) {
            this._attributeEnable = state;
            this.dirty();
        },

        isEnabled: function () {
            return this._attributeEnable;
        },

        apply: function ( /*state*/) {
            this.setDirty( false );
        }
    } ), 'osg', 'Billboard' );

    return BillboardAttribute;

} );
