var _ = require('lodash');

// module declaration
var modules = [
    'Parcel'
];

// Filter fields
var filterFields = {
    parcelStatus: {
        type: 'string'
    },
    customer: {
        type: 'objectId'
    },
    carryr: {
        type: 'objectId'
    }
};

// Search Fields
var searchFields = {
    content: 'String'
};

var ref = [];

// Sort Fields
var sortFields = {
    distanceTravelled_measure: {
        type: 'object',
        measure: {
            type: 'number'
        }
    },
    timeTaken: {
        type: 'string'
    },
    commission_amount: {
        type: 'object',
        amount: {
            type: 'number'
        }
    }
};

// Location object else null
var locationField = 'fromAddress.loc';

module.exports.SearchConfig = {
    'locationField': locationField,
    'filterFields': filterFields,
    'searchFields': searchFields,
    'sortFields': sortFields,
    'modules': modules,
    'ref': ref
};

