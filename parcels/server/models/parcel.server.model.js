'use strict';

/**
 * Module dependencies
 */
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var path = require('path');
var config = require(path.resolve('./config/config'));
var AddressSchema = require(path.resolve('./modules/customers/server/models/customer.server.model')).AddressSchema;


/*
* Parcel schema.
* */
var ParcelSchema = new Schema({
    customer: {
        type: Schema.ObjectId,
        ref: 'Customer'
    },
    carryr: {
        type: Schema.ObjectId,
        ref: 'Carryr'
    },
    fromAddress: AddressSchema,
    toAddress: AddressSchema,
    distanceTravelled: {
        measure: {
            type: Number
        },
        unit: {
            type: String,
            default: 'meters',
            required: 'distanceTravelled Units is missing'
        }
    },
    timeOfTravel: {
        measure: {
            type: Number
        },
        unit: {
            type: String,
            default: 'minutes',
            required: 'timeOfTravel Units is missing'
        }
    },
    carryrType: {
        type: String,
        enum: config.carryrTypes
    },
    parcelPictures: [
        {
            url: {
                type: String,
                required: 'Parcel image path is missing'
            },
            mimeType: {
                type: String
            }
        }
    ],
    content: {
        type: String,
        default: ''
    },
    cost: {
        currency: {
            type: String,
            enum: config.supportedCurrencies,
            default: 'GBP',
            required: 'Cost currency is missing'

        },
        amount: {
            type: Number
        }
    },
    commission: {
        currency: {
            type: String,
            enum: config.supportedCurrencies,
            default: 'GBP',
            required: 'Commission currency is missing'
        },
        amount: {
            type: Number
        }
    },
    parcelStatus: {
        type: String,
        /*
        * Parcel is booked when customer books it for delivery
        * Parcel is accepted when a carryr accepts it.
        * */
        enum: ['pending', 'booked', 'accepted', 'pickedUp', 'inTransit', 'delivered', 'canceled'],
        default: ['pending'],
        required: 'Please provide parcel status info'
    },
    pickupOtp: {
        type: {
            OTP: {
                type: Number,
                required: true
            },
            time: {
                type: Date,
                default: Date.now,
                required: true
            }
        }
    },
    deliveryOtp: {
        type: {
            OTP: {
                type: Number,
                required: true
            },
            time: {
                type: Date,
                default: Date.now,
                required: true
            }
        }
    },
    activityLog: [
        {
            status: {
                type: String
            },
            dateTime: {
                type: Date,
                default: Date.now
            }
        }
    ],
    order: {
        type: Schema.ObjectId,
        ref: 'Order'
    },
    created: {
        type: Date,
        default: Date.now
    }
});

mongoose.model('Parcel', ParcelSchema);
