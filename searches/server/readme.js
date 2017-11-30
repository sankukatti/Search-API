/*
* modules
* */
var modules = [
    'Parcel'
];

/*
* searchFields
* */
var searchFields = {
    content: 'string',
    services_name: 'objectArray'
};

/*
 * filterFields
 * */
var filterFields = {

    /* "active"				: "bool" */

    locality: {
        type: 'string'
    },

    /*
    * services_name - Divide the field by first `_`.
    * Array[0] will be main field name and
    * Array[1] will be the field inside the main field.
    * */
    services_name: {
        type: 'object',
        name: {
            type: 'string'
        }
    },
    services_cost: {
        type: 'object',
        cost: {
            type: 'range'
        }
    },
    user_id: {
        type: 'refObject',
        id: {
            type: 'objectId'
        }
    },
    user_displayName: {
        type: 'refObject',
        displayName: {
            type: 'string'
        }
    },
    user_age: {
        type: 'refObject',
        age: {
            type: 'range'
        }
    },
    activities: {
        type: 'arrayObjectIds'
    },
    beActive: {
        type: 'bool'
    },
    customer: {
        type: 'objectId'
    }
};

/*
 * ref
 * */
var ref = ['user', 'parcel'];

/*
 * sortFields
 * */
var sortFields = {
    likes: 'string',
    subscription_level: 'number'
};
