'use strict';

/*
* Module dependencies
* */
var mongoose = require('mongoose');
var path = require('path');
var config = require(path.resolve('./config/config'));
var Parcel = mongoose.model('Parcel');
var _ = require('lodash');
var googleDirectionsApi = require(path.resolve('./modules/core/server/helpers')).googleDirectionsApi;
var async = require('async');
var carryrTypesService = require(path.resolve('./modules/carryrTypes/server/services/carryrTypes.server.service'));
var searchController = require(path.resolve('./modules/searches/server/controllers/searches.server.controller'));
var orderServices = require(path.resolve('./modules/orders/server/services/order.server.service'));

/*
* Email dependencies.
* */
var fs = require('fs');
var Handlebars = require('handlebars');
var nodemailer = require('nodemailer');
var smtpTransport = nodemailer.createTransport(config.mailer.options);

/*
* OTP Dependencies.
* */
var OTPClass = require(path.resolve('./modules/core/server/helpers/otp'));

/*
 *
 * ###################### REPO FUNCTIONS ##########################
 *
 * */

function saveParcel(parcel) {
    return new Promise(function (resolve, reject) {
        parcel.save(function (error) {
            if (error) {
                return reject(error);
            } else {
                return resolve(parcel);
            }
        });
    });
}

function findById(parcelId) {
    return new Promise(function (resolve, reject) {
        Parcel.findById({ _id: parcelId }).exec(function (error, parcel) {
            if (error) {
                return reject(error);
            } else {
                if (parcel) {
                    return resolve(parcel);
                } else {
                    return reject({ code: 'PARCEL_DOES_NOT_EXIST' });
                }
            }
        });
    });
}

function populateParcelWithCustomerAndCarryr(parcel) {
    return new Promise(function (resolve, reject) {
        var populateOptions = [
            {
                path: 'customer',
                populate: {
                    path: 'user',
                    model: 'User',
                    select: 'firstName lastName profileImageURL'
                }
            },
            {
                path: 'carryr',
                populate: {
                    path: 'user',
                    model: 'User',
                    select: 'firstName lastName profileImageURL'
                }
            }
        ];
        parcel.populate(populateOptions, function (error, parcelPopulated) {
            if (error) {
                return resolve(parcel);
            } else {
                return resolve(parcelPopulated);
            }
        });
    });
}


/*
 *
 * ###################### END OF REPO FUNCTIONS ##########################
 *
 * */


/*
 *
 * ##################### EXPORT FUNCTIONS #################################
 *
 * */


function createParcelWithLoggedCustomer(parcelDetails) {
    return new Promise(function (resolve, reject) {
        // Delete fields which are private.
        parcelDetails = cleanUpParcelBeforeSave(parcelDetails);

        /* A temp fix */
        /* parcelDetails.parcelPictures = [];
        parcelDetails.parcelPictures.push({ url: 'modules/parcels/client/img/defaultParcel.jpg', mimeType: 'image/jpg' }); */

        if (parcelDetails.hasOwnProperty('customer')) {
            if (parcelDetails.customer.hasOwnProperty('_id')) {
                return reject({ code: 'MALFORMED_PARCEL_CUSTOMER' });
            }
        } else {
            return reject({ code: 'MALFORMED_PARCEL_CUSTOMER' });
        }

        var parcelMongObj = new Parcel(parcelDetails);
        saveParcel(parcelMongObj)
        .then(function (parcel) {
            updateParcelWithDerivables(parcel)
            .then(function (parcel) {
                return resolve({ message: 'ok', parcel: parcel });
            }, function (error) {
                return resolve({ message: 'Update successful with errors', parcel: parcel, error: error });
            });
        }, function (error) {
            return reject(error);
        });
    });
}

function updateParcelCustomer(customer, parcel, parcelUpdates) {
    return new Promise(function (resolve, reject) {
        // Delete fields which are private.
        parcelUpdates = cleanUpParcelBeforeSave(parcelUpdates);

        if (parcel.parcelStatus === 'pending') {
            if (parcel.customer + '' === customer._id + '') {
                parcel = _.assignIn(parcel, parcelUpdates);
                saveParcel(parcel)
                    .then(function (parcel) {
                        updateParcelWithDerivables(parcel)
                            .then(function (parcel) {
                                return resolve({ message: 'ok', parcel: parcel });
                            }, function (error) {
                                return resolve({ message: 'Update successful with errors', parcel: parcel, error: error });
                            });
                    }, function (error) {
                        return reject(error);
                    });
            } else {
                return reject({ code: 'UNAUTHORIZED' });
            }
        } else {
            return reject({ code: 'PARCEL_CANNOT_BE_UPDATED' });
        }
    });
}

function updateParcelWithDerivables(parcel) {
    return new Promise(function (resolve, reject) {
        if (
            parcel.carryrType &&
            parcel.carryrType.length > 0
        ) {
            if (
                parcel.fromAddress &&
                parcel.toAddress
            ) {
                if (
                    parcel.fromAddress.loc &&
                    parcel.toAddress.loc
                ) {
                    async.waterfall([

                        // Get CarryrType object based on parcel's carryrType.
                        function (done) {
                            carryrTypesService.getCarryrTypeByName(parcel.carryrType)
                                .then(function (carryrTypeObj) {
                                    done(false, carryrTypeObj);
                                }, function (error) {
                                    done(error);
                                });
                        },

                        // Get distanceTravelled and other measures
                        function (carryrType, done) {
                            var origin = {
                                lng: parcel.fromAddress.loc[0],
                                lat: parcel.fromAddress.loc[1]
                            };
                            var dest = {
                                lng: parcel.toAddress.loc[0],
                                lat: parcel.toAddress.loc[1]
                            };

                            calParcelDistance(origin, dest, null/* getGoogleTravelMode(parcel.carryrType)*/)
                            .then(function (distance) {

                                var timeOfTravel = calApproxTimeOfTravel(distance, carryrType);
                                var cost = calParcelCost(distance, timeOfTravel, carryrType);
                                var commission = calParcelCommission(distance, timeOfTravel, carryrType);

                                parcel.distanceTravelled.measure = distance;
                                parcel.timeOfTravel.measure = timeOfTravel;
                                parcel.cost.amount = cost;
                                parcel.commission.amount = commission;

                                saveParcel(parcel)
                                .then(function (parcel) {
                                    return resolve(parcel);
                                }, function (error) {
                                    done(error);
                                });

                            }, function (error) {
                                done(error);
                            });
                        }

                    ], function (error, done) {
                        return reject(error);
                    });
                } else {
                    return resolve(parcel);
                }
            } else {
                return resolve(parcel);
            }
        } else {
            return resolve(parcel);
        }
    });
}

function addParcelImage(parcel, imageFileObj) {
    return new Promise(function (resolve, reject) {
        if (imageFileObj) {
            if (imageFileObj.hasOwnProperty('path') && imageFileObj.hasOwnProperty('mimetype')) {
                parcel.parcelPictures.push({ url: imageFileObj.path, mimeType: imageFileObj.mimetype });
                saveParcel(parcel)
                .then(function (parcel) {
                    return resolve({ message: 'ok', parcel: parcel });
                }, function (error) {
                    return reject(error);
                });
            } else {
                return reject({ code: 'PARCEL_PIC_DETAIL_INVALID' });
            }
        } else {
            return reject({ code: 'PARCEL_IMAGE_MISSING' });
        }
    });
}

function deleteParcelImage(customer, parcel, imageIndex) {
    return new Promise(function (resolve, reject) {
        if (imageIndex && imageIndex !== null && imageIndex >= 0) {
            parcel.parcelPictures.splice(imageIndex, 1);
            saveParcel(parcel)
                .then(function (customer) {
                    return resolve({ message: 'ok', parcel: cleanParcelBeforeSending(parcel) });
                }, function (error) {
                    return reject(error);
                });
        } else {
            return reject({ code: 'INVALID_INDEX_VALUE' });
        }
    });
}

function validateParcelForCompleteness(parcel) {
    return new Promise(function (resolve, reject) {
        var errors = [];
        if (!parcel.toAddress.name || parcel.toAddress.name.length <= 0) {
            errors.push({ code: 'TO_ADDRESS_NAME_MISSING' });
        }

        if (!parcel.toAddress.email || parcel.toAddress.email.length <= 0) {
            errors.push({ code: 'TO_ADDRESS_EMAIL_MISSING' });
        }

        if (!parcel.fromAddress.email || parcel.fromAddress.email.length <= 0) {
            errors.push({ code: 'FROM_ADDRESS_EMAIL_MISSING' });
        }

        if (!parcel.fromAddress.phoneNumber) {
            errors.push({ code: 'FROM_ADDRESS_PHONE_MISSING' });
        }

        if (!parcel.toAddress.phoneNumber) {
            errors.push({ code: 'TO_ADDRESS_PHONE_MISSING' });
        }

        if (!parcel.toAddress.loc || !parcel.toAddress.loc.length === 2) {
            errors.push({ code: 'TO_ADDRESS_LAT_LNG_MISSING' });
        }

        if (!parcel.fromAddress.loc || !parcel.fromAddress.loc.length === 2) {
            errors.push({ code: 'FROM_ADDRESS_LAT_LNG_MISSING' });
        }

        if (!parcel.parcelPictures.length || parcel.parcelPictures.length <= 0) {
            errors.push({ code: 'PARCEL_IMAGE_MISSING' });
        }

        if (!parcel.cost || parcel.cost.amount <= 0) {
            errors.push({ code: 'INVALID_PARCEL_COST' });
        }

        if (!parcel.commission && parcel.commission.amount <= 0) {
            errors.push({ code: 'INVALID_PARCEL_COMMISSION' });
        }

        if (!parcel.distanceTravelled && parcel.distanceTravelled.measure <= 0) {
            errors.push({ code: 'INVALID_PARCEL_DISTANCE' });
        }

        if (!parcel.timeOfTravel && parcel.timeOfTravel.measure <= 0) {
            errors.push({ code: 'INVALID_PARCEL_TIME_TRAVEL' });
        }

        if (errors.length <= 0) {
            return resolve();
        } else {
            return reject({ errors: errors });
        }


    });
}

function bookThisParcel(customer, parcel, token) {
    return new Promise(function (resolve, reject) {

        async.waterfall([
            function (done) {
                if (parcel.parcelStatus === 'pending') {
                    if (parcel.customer + '' === customer._id + '') {
                        validateParcelForCompleteness(parcel)
                            .then(function (success) {
                                done(false);
                            }, function (error) {
                                done(error);
                            });
                    } else {
                        done({ code: 'UNAUTHORIZED' });
                    }
                } else {
                    done({ code: 'PARCEL_CANNOT_BE_BOOKED' });
                }
            },
            function (done) {
                orderServices.createOrder(customer, parcel.cost.amount, parcel.cost.currency, [parcel], token)
                .then(function (success) {
                    var orderId = success.order._id;
                    done(false, orderId);
                }, function (error) {
                    done(error);
                });
            },
            function (orderId, done) {
                parcel.parcelStatus = 'booked';
                parcel.order = orderId;
                parcel.activityLog.push({ status: 'booked', dateTime: new Date() });
                sendParcelBookedEmail(parcel);
                saveParcel(parcel)
                .then(function (parcel) {
                    done(false, { message: 'ok', parcel: parcel });
                }, function (error) {
                    done(error);
                });
            }],
            function (error, success) {
                if (error) {
                    return reject(error);
                } else {
                    return resolve(success);
                }
            }
        );

        function getOTP(done) {

            done(false);
        }
    });
}

function cancelThisParcel(customer, parcel) {
    return new Promise(function (resolve, reject) {
        if (parcel.customer + '' !== customer._id + '') {
            return reject({ code: 'UNAUTHORIZED' });
        } else if (parcel.parcelStatus === 'booked') {
            parcel.parcelStatus = 'canceled';
            parcel.activityLog.push({ status: 'canceled', dateTime: new Date() });
            saveParcel(parcel)
            .then(function (parcel) {
                return resolve({ message: 'ok', parcel: parcel });
            }, function (error) {
                return reject(error);
            });
        } else {
            return reject({ code: 'PARCEL_CANNOT_BE_CANCELED' });
        }
    });
}

function getOpenParcels(req, radius) {
    return new Promise(function (resolve, reject) {
        searchController.mapSearchStart(req, radius, 'parcels')
        .then(function (success) {
            var jobs = success.content;

            var populateOptions = [
                {
                    path: 'customer',
                    populate: {
                        path: 'user',
                        model: 'User',
                        select: 'firstName lastName profileImageURL'
                    }
                },
                {
                    path: 'carryr',
                    populate: {
                        path: 'user',
                        model: 'User',
                        select: 'firstName lastName profileImageURL'
                    }
                }
            ];

            Parcel.populate(jobs, populateOptions, function (error, jobs) {
                if (error) {
                    return reject(error);
                } else {
                    success.content = jobs;
                    return resolve({ message: 'ok', jobs: success });
                }
            });

        }, function (error) {
            return reject(error);
        });
    });
}

function getParcels(searchQuery) {
    return new Promise(function (resolve, reject) {
        searchController.search(searchQuery, 'parcels')
        .then(function (success) {
            var jobs = success.content;

            var populateOptions = [
                {
                    path: 'customer',
                    populate: {
                        path: 'user',
                        model: 'User',
                        select: 'firstName lastName profileImageURL'
                    }
                },
                {
                    path: 'carryr',
                    populate: {
                        path: 'user',
                        model: 'User',
                        select: 'firstName lastName profileImageURL'
                    }
                }
            ];

            Parcel.populate(jobs, populateOptions, function (error, jobs) {
                if (error) {
                    return reject(error);
                } else {
                    success.content = jobs;
                    return resolve({ message: 'ok', parcels: success });
                }
            });

        }, function (error) {
            return reject(error);
        });
    });
}

function assignCarryrToTheParcel(carryr, parcel) {
    return new Promise(function (resolve, reject) {
        if (parcel.parcelStatus === 'booked') {
            if (carryr.carryrType + '' === parcel.carryrType + '') {
                parcel.carryr = carryr;
                parcel.parcelStatus = 'accepted';

                var pickupOtp;
                var deliveryOtp;
                var OTPGenObject = new OTPClass(6);
                pickupOtp = OTPGenObject.generateOTP();
                deliveryOtp = OTPGenObject.generateOTP();
                parcel.pickupOtp = {};
                parcel.deliveryOtp = {};

                parcel.pickupOtp.OTP = pickupOtp;
                parcel.pickupOtp.time = new Date();
                parcel.deliveryOtp.OTP = deliveryOtp;
                parcel.deliveryOtp.time = new Date();

                parcel.activityLog.push({ status: 'accepted', dateTime: new Date() });

                saveParcel(parcel)
                    .then(function (parcel) {
                        sendParcelAcceptedEmail(parcel);
                        populateParcelWithCustomerAndCarryr(parcel)
                            .then(function (populatedParcel) {
                                return resolve({ message: 'ok', parcel: populatedParcel });
                            }, function (parcel) {
                                return resolve({ message: 'ok', parcel: parcel });
                            });
                    }, function (error) {
                        return reject(error);
                    });
            } else {
                return reject({ code: 'INCOMPATIBLE_CARRYR_TYPES' });
            }
        } else {
            return reject({ code: 'CARRYR_CANNOT_BE_ASSIGNED' });
        }
    });
}

function initiatePickup(carryr, parcel, cb) {
    var pickupOtp = 0;

    async.waterfall(
        [
            validateParcel,
            validateCarryr,
            getOTP,
            updateParcelWithPickupOTP
        ], cb);

    function validateParcel(done) {
        if (parcel.parcelStatus === 'accepted') {
            done(false);
        } else {
            done({ code: 'PARCEL_CANNOT_BE_PICKED_UP' });
        }
    }

    function getOTP(done) {
        var OTPGenObject = new OTPClass(6);
        pickupOtp = OTPGenObject.generateOTP();
        done(false);
    }

    function validateCarryr(done) {
        if (carryr._id + '' === parcel.carryr + '') {
            done(false);
        } else {
            done({ code: 'UNAUTHORIZED' });
        }
    }

    function updateParcelWithPickupOTP(done) {
        // Update OTP
        parcel.pickupOtp = {};
        parcel.pickupOtp.OTP = pickupOtp;
        parcel.pickupOtp.time = new Date();

        saveParcel(parcel)
        .then(function (parcel) {
            sendPickupOtpEmail(parcel, pickupOtp);
            populateParcelWithCustomerAndCarryr(parcel)
            .then(function (populatedParcel) {
                done(false, { message: 'ok', parcel: cleanParcelBeforeSending(populatedParcel) });
            }, function (parcel) {
                done(false, { message: 'ok', parcel: cleanParcelBeforeSending(parcel) });
            });
        }, function (error) {
            done(error);
        });
    }
}

function pickup(carryr, parcel, otp, cb) {
    async.waterfall([
        validateParcel,
        validateCarryr,
        validateOtp,
        updateParcelWithPickedUpStatus
    ], cb);

    function validateParcel(done) {
        if (parcel.parcelStatus === 'accepted') {
            done(false);
        } else {
            done({ code: 'PARCEL_CANNOT_BE_PICKED_UP' });
        }
    }

    function validateCarryr(done) {
        if (carryr._id + '' === parcel.carryr + '') {
            done(false);
        } else {
            done({ code: 'UNAUTHORIZED' });
        }
    }

    function validateOtp(done) {
        if (!otp || otp === null) {
            done({ code: 'PICKUP_OTP_IS_REQUIRED_TO_VALIDATE_PICKUP' });
        } else {
            otp = Number(otp);
            if (parcel.pickupOtp.OTP === otp) {
                var currentDate = new Date();
                var otpAgeInMinutes = ((currentDate - parcel.pickupOtp.time) / 1000) / 60;
                if (false /* otpAgeInMinutes > 5*/) {
                    done({ code: 'PICKUP_OTP_HAS_EXPIRED_GENERATE_AGAIN' });
                } else {
                    done(false);
                }
            } else {
                done({ code: 'PICKUP_OTP_MISMATCH' });
            }
        }
    }

    function updateParcelWithPickedUpStatus(done) {
        parcel.parcelStatus = 'pickedUp';
        var activityLogObj = {
            status: 'pickedUp',
            time: new Date()
        };
        parcel.activityLog.push(activityLogObj);
        saveParcel(parcel)
        .then(function (parcel) {
            sendPickUpValidatedEmail(parcel);
            populateParcelWithCustomerAndCarryr(parcel)
            .then(function (populatedParcel) {
                done(false, { message: 'ok', parcel: cleanParcelBeforeSending(populatedParcel) });
            }, function (parcel) {
                done(false, { message: 'ok', parcel: cleanParcelBeforeSending(parcel) });
            });
        }, function (error) {
            done(error);
        });
    }
}

function initiateDelivery(carryr, parcel, cb) {
    var deliveryOtp = 0;

    async.waterfall(
        [
            validateParcel,
            validateCarryr,
            getOTP,
            updateParcelWithDeliveryOTP
        ], cb);

    function validateParcel(done) {
        if (parcel.parcelStatus === 'pickedUp') {
            done(false);
        } else {
            done({ code: 'PARCEL_CANNOT_BE_DELIVERED' });
        }
    }

    function getOTP(done) {
        var OTPGenObject = new OTPClass(6);
        deliveryOtp = OTPGenObject.generateOTP();
        done(false);
    }

    function validateCarryr(done) {
        if (carryr._id + '' === parcel.carryr + '') {
            done(false);
        } else {
            done({ code: 'UNAUTHORIZED' });
        }
    }

    function updateParcelWithDeliveryOTP(done) {
        // Update OTP
        parcel.deliveryOtp = {};
        parcel.deliveryOtp.OTP = deliveryOtp;
        parcel.deliveryOtp.time = new Date();

        saveParcel(parcel)
            .then(function (parcel) {
                sendDeliveryOtpEmail(parcel, deliveryOtp);
                populateParcelWithCustomerAndCarryr(parcel)
                    .then(function (populatedParcel) {
                        done(false, { message: 'ok', parcel: cleanParcelBeforeSending(populatedParcel) });
                    }, function (parcel) {
                        done(false, { message: 'ok', parcel: cleanParcelBeforeSending(parcel) });
                    });
            }, function (error) {
                done(error);
            });
    }
}

function deliver(carryr, parcel, otp, cb) {
    async.waterfall([
        validateParcel,
        validateCarryr,
        validateOtp,
        updateParcelWithDeliveredStatusAndCost,
        updateOrderWithCosts,
        initiatePayment
    ], cb);

    function validateParcel(done) {
        if (parcel.parcelStatus === 'pickedUp') {
            done(false);
        } else {
            done({ code: 'PARCEL_CANNOT_BE_DELIVERED' });
        }
    }

    function validateCarryr(done) {
        if (carryr._id + '' === parcel.carryr + '') {
            done(false);
        } else {
            done({ code: 'UNAUTHORIZED' });
        }
    }

    function validateOtp(done) {
        if (!otp || otp === null) {
            done({ code: 'DELIVERY_OTP_IS_REQUIRED_TO_VALIDATE_DELIVERY' });
        } else {
            otp = Number(otp);
            if (parcel.deliveryOtp.OTP === otp) {
                var currentDate = new Date();
                var otpAgeInMinutes = ((currentDate - parcel.deliveryOtp.time) / 1000) / 60;
                if (false /* otpAgeInMinutes > 5*/) {
                    done({ code: 'DELIVERY_OTP_HAS_EXPIRED_GENERATE_AGAIN' });
                } else {
                    done(false);
                }
            } else {
                done({ code: 'DELIVERY_OTP_MISMATCH' });
            }
        }
    }

    function updateParcelWithDeliveredStatusAndCost(done) {
        parcel.parcelStatus = 'delivered';
        var activityLogObj = {
            status: 'delivered',
            time: new Date()
        };
        parcel.activityLog.push(activityLogObj);

        calFinalCostCommissionParcel(parcel)
        .then(function (parcel) {
            done(false, parcel);
        }, function (error) {
            done(error);
        });
    }

    function updateOrderWithCosts(parcel, done) {
        orderServices.updateOrderAmount(parcel.order, parcel.cost.amount)
        .then(function (success) {
            done(false, parcel);
        }, function (error) {
            done(error);
        });
    }

    function initiatePayment(parcel, done) {
        orderServices.makePayment(parcel.order)
        .then(function (success) {
            sendDeliveryValidatedEmail(parcel);
            saveParcel(parcel)
                .then(function (parcel) {
                    populateParcelWithCustomerAndCarryr(parcel)
                        .then(function (populatedParcel) {
                            done(false, { message: 'ok', parcel: cleanParcelBeforeSending(populatedParcel) });
                        }, function (error) {
                            done(false, { message: 'ok', parcel: cleanParcelBeforeSending(parcel) });
                        });
                }, function (error) {
                    done(error);
                });
        }, function (error) {
            done(error);
        });
    }
}


/*
 *
 * ##################### END EXPORT FUNCTIONS #################################
 *
 * */

function cleanUpParcelBeforeSave(parcelDetails) {
    delete parcelDetails._id;
    delete parcelDetails.cost;
    delete parcelDetails.commission;
    delete parcelDetails.parcelStatus;
    delete parcelDetails.activityLog;
    delete parcelDetails.distanceTravelled;
    delete parcelDetails.timeOfTravel;
    delete parcelDetails.carryr;
    return parcelDetails;
}

function cleanParcelBeforeSending(parcel) {
    parcel = parcel.toObject();
    delete parcel.deliveryOtp;
    delete parcel.pickupOtp;
    delete parcel.order;
    return parcel;
}

function getGoogleTravelMode(carryrTypeName) {
    var returnMode = null;
    switch (carryrTypeName) {
    case 'bicycle': returnMode = 'bicycling'; break;
    }
    return returnMode;
}

function calFinalCostCommissionParcel(parcel) {
    return new Promise(function (resolve, reject) {
        // Check if activity log has pickedUp and delivered logs
        var pickupIndex = _.findIndex(parcel.activityLog, { status: 'pickedUp' });
        var deliveryIndex = _.findIndex(parcel.activityLog, { status: 'delivered' });
        if (pickupIndex > -1 && deliveryIndex > -1) {
            var pickupTime = parcel.activityLog[pickupIndex].dateTime;
            var deliveryTime = parcel.activityLog[deliveryIndex].dateTime;
            var MT = ((deliveryTime - pickupTime) / 1000) / 60;
            parcel.timeOfTravel.measure = MT;

            carryrTypesService.getCarryrTypeByName(parcel.carryrType)
            .then(function (carryrTypeObj) {

                var cost = calParcelCost(parcel.distanceTravelled.measure, parcel.timeOfTravel.measure, carryrTypeObj);
                var commission = calParcelCommission(parcel.distanceTravelled.measure, parcel.timeOfTravel.measure, carryrTypeObj);

                parcel.cost.amount = cost;
                parcel.commission.amount = commission;
                return resolve(parcel);
                /* saveParcel(parcel)
                 .then(function (parcel) {
                 return resolve(parcel);
                 }, function (error) {
                 return reject(error);
                 });*/
            }, function (error) {
                return reject(error);
            });
        } else {
            return reject({ code: 'PICKUP_OR_DELIVERY_TIME_MISSING' });
        }
    });
}

function calParcelDistance(origin, dest, mode) {
    return new Promise(function (resolve, reject) {
        googleDirectionsApi.getDirectionOnLatLng(origin, dest, mode)
        .then(function (success) {
            try {
                return resolve(success[0].legs[0].distance.value);
            } catch (error) {
                return reject({ code: 'GOOGLE_DIRECTIONS_RESPONSE_FORMAT_ERROR', response: success });
            }
        }, function (error) {
            return reject(error);
        });
    });
}

function calApproxTimeOfTravel(distance, carryrTypeObj) {
    return ((getDTInMiles(distance) * 60) / carryrTypeObj.defaultSpeed);
}

function calActualTimeOfTravel(parcel, carryrTypeObj) {
}

function calParcelCost(DT, MT, carryrTypeObj) {
    DT = getDTInMiles(DT);
    MT = getProcessedTM(MT);
    var DTM = carryrTypeObj.cost.DTM;
    var MTM = carryrTypeObj.cost.MTM;

    return (((((DT * DTM) + (MT * MTM)) * 1.08) * 1.1) * 1.2);
}

function calParcelCommission(DT, MT, carryrTypeObj) {
    DT = getDTInMiles(DT);
    MT = getProcessedTM(MT);
    var DTM = carryrTypeObj.commission.DTM;
    var MTM = carryrTypeObj.commission.MTM;

    return (((DT * DTM) + (MT * MTM)) * (((60 / MT) * DT)) * 0.1);
}

function getDTInMiles(DT) {
    return (Number((DT / 1609.344).toString().match(/^-?\d+(?:\.\d{0,1})?/)[0]));
}

function getProcessedTM(TM) {
    return Math.round(TM);
}

function sendParcelBookedEmail(parcel) {
    return new Promise(function (resolve, reject) {
        var customer = parcel.fromAddress.email;
        var deliveredTo = parcel.toAddress.email;
        var htmlStringToCustomer = '';
        var htmlStringToDeliveredTo = '';
        fs.readFile('./modules/parcels/server/templates/booked-to-customer-parcel-email.server.view.html', 'UTF8', function (err, data) {
            if (err) {
                htmlStringToCustomer = '';
            } else {
                htmlStringToCustomer = data;
            }
            var template = Handlebars.compile(htmlStringToCustomer);
            var email = template({
                name: parcel.fromAddress.name
            });

            var mailOptions = {
                to: customer,
                from: config.mailer.from,
                subject: 'Parcel is booked.',
                html: email
            };

            smtpTransport.sendMail(mailOptions, function (err) {
                return resolve();
            });
        });
        fs.readFile('./modules/parcels/server/templates/booked-to-deliveredto-parcel-email.server.view.html', 'UTF8', function (err, data) {
            if (err) {
                htmlStringToDeliveredTo = '';
            } else {
                htmlStringToDeliveredTo = data;
            }
            var template = Handlebars.compile(htmlStringToDeliveredTo);
            var email = template({
                name: parcel.toAddress.name
            });

            var mailOptions = {
                to: deliveredTo,
                from: config.mailer.from,
                subject: 'Parcel is booked.',
                html: email
            };

            smtpTransport.sendMail(mailOptions, function (err) {
                return resolve();
            });
        });
    });
}

function sendParcelAcceptedEmail(parcel) {
    return new Promise(function (resolve, reject) {
        var customer = parcel.fromAddress.email;
        var deliveredTo = parcel.toAddress.email;
        var htmlStringToCustomer = '';
        var htmlStringToDeliveredTo = '';
        fs.readFile('./modules/parcels/server/templates/send-parcel-accepted-from-email.server.view.html', 'UTF8', function (err, data) {
            if (err) {
                htmlStringToCustomer = '';
            } else {
                htmlStringToCustomer = data;
            }
            var template = Handlebars.compile(htmlStringToCustomer);
            var email = template({
                name: parcel.fromAddress.name,
                otp: parcel.pickupOtp.OTP
            });

            var mailOptions = {
                to: customer,
                from: config.mailer.from,
                subject: 'Carryr is assigned to your parcel.',
                html: email
            };

            smtpTransport.sendMail(mailOptions, function (err) {
                return resolve();
            });
        });
        fs.readFile('./modules/parcels/server/templates/send-parcel-accepted-to-email.server.view.html', 'UTF8', function (err, data) {
            if (err) {
                htmlStringToDeliveredTo = '';
            } else {
                htmlStringToDeliveredTo = data;
            }
            var template = Handlebars.compile(htmlStringToDeliveredTo);
            var email = template({
                name: parcel.toAddress.name,
                otp: parcel.deliveryOtp.OTP
            });

            var mailOptions = {
                to: deliveredTo,
                from: config.mailer.from,
                subject: 'Carryr is assigned to your parcel.',
                html: email
            };

            smtpTransport.sendMail(mailOptions, function (err) {
                return resolve();
            });
        });
    });
}

function sendPickupOtpEmail(parcel, OTP) {
    var to = parcel.fromAddress.email;
    return new Promise(function (resolve, reject) {
        var htmlString = '';
        fs.readFile('./modules/parcels/server/templates/pickup-otp-email.server.view.html', 'UTF8', function (err, data) {
            if (err) {
                htmlString = '';
            } else {
                htmlString = data;
            }
            var template = Handlebars.compile(htmlString);
            var pickupOtpEmail = template({
                name: parcel.fromAddress.name,
                otp: OTP
            });

            var mailOptions = {
                to: to,
                from: config.mailer.from,
                subject: 'Parcel pickup verification code',
                html: pickupOtpEmail
            };

            smtpTransport.sendMail(mailOptions, function (err) {
                return resolve();
            });
        });
    });
}

function sendPickUpValidatedEmail(parcel) {
    return new Promise(function (resolve, reject) {
        var customer = parcel.fromAddress.email;
        var deliveredTo = parcel.toAddress.email;

        var htmlStringToCustomer = '';
        var htmlStringToDeliveredTo = '';
        fs.readFile('./modules/parcels/server/templates/pickup-validation-customer-email.server.view.html', 'UTF8', function (err, data) {
            if (err) {
                htmlStringToCustomer = '';
            } else {
                htmlStringToCustomer = data;
            }
            var template = Handlebars.compile(htmlStringToCustomer);
            var email = template({
                name: parcel.fromAddress.name,
                otp: parcel.pickupOtp.OTP
            });

            var mailOptions = {
                to: customer,
                from: config.mailer.from,
                subject: 'Parcel picked up successfully.',
                html: email
            };

            smtpTransport.sendMail(mailOptions, function (err) {
                return resolve();
            });
        });
        fs.readFile('./modules/parcels/server/templates/pickup-validation-customer-email.server.view.html', 'UTF8', function (err, data) {
            if (err) {
                htmlStringToDeliveredTo = '';
            } else {
                htmlStringToDeliveredTo = data;
            }
            var template = Handlebars.compile(htmlStringToDeliveredTo);
            var email = template({
                name: parcel.toAddress.name,
                otp: parcel.deliveryOtp.OTP
            });

            var mailOptions = {
                to: deliveredTo,
                from: config.mailer.from,
                subject: 'Parcel picked up successfully.',
                html: email
            };

            smtpTransport.sendMail(mailOptions, function (err) {
                return resolve();
            });
        });
    });
}

function sendDeliveryOtpEmail(parcel, OTP) {
    var to = parcel.toAddress.email;
    return new Promise(function (resolve, reject) {
        var htmlString = '';
        fs.readFile('./modules/parcels/server/templates/delivery-otp-email.server.view.html', 'UTF8', function (err, data) {
            if (err) {
                htmlString = '';
            } else {
                htmlString = data;
            }
            var template = Handlebars.compile(htmlString);
            var deliveryOtpEmail = template({
                name: parcel.fromAddress.name,
                otp: OTP
            });

            var mailOptions = {
                to: to,
                from: config.mailer.from,
                subject: 'Parcel delivery verification code',
                html: deliveryOtpEmail
            };

            smtpTransport.sendMail(mailOptions, function (err) {
                return resolve();
            });
        });
    });
}

function sendDeliveryValidatedEmail(parcel) {
    return new Promise(function (resolve, reject) {
        var customer = parcel.fromAddress.email;
        var deliveredTo = parcel.toAddress.email;

        var htmlStringToCustomer = '';
        var htmlStringToDeliveredTo = '';
        fs.readFile('./modules/parcels/server/templates/delivery-validated-customer-email.server.view.html', 'UTF8', function (err, data) {
            if (err) {
                htmlStringToCustomer = '';
            } else {
                htmlStringToCustomer = data;
            }
            var template = Handlebars.compile(htmlStringToCustomer);
            var email = template({
                name: parcel.fromAddress.name,
                otp: parcel.pickupOtp.OTP
            });

            var mailOptions = {
                to: customer,
                from: config.mailer.from,
                subject: 'Parcel is booked.',
                html: email
            };

            smtpTransport.sendMail(mailOptions, function (err) {
                return resolve();
            });
        });
        fs.readFile('./modules/parcels/server/templates/delivery-validated-carryr-email.server.view.html', 'UTF8', function (err, data) {
            if (err) {
                htmlStringToDeliveredTo = '';
            } else {
                htmlStringToDeliveredTo = data;
            }
            var template = Handlebars.compile(htmlStringToDeliveredTo);
            var email = template({
                name: parcel.toAddress.name,
                otp: parcel.deliveryOtp.OTP
            });

            var mailOptions = {
                to: deliveredTo,
                from: config.mailer.from,
                subject: 'Parcel delivered successfully.',
                html: email
            };

            smtpTransport.sendMail(mailOptions, function (err) {
                return resolve();
            });
        });
    });
}

module.exports = {
    findById: findById,
    createParcelWithLoggedCustomer: createParcelWithLoggedCustomer,
    updateParcelCustomer: updateParcelCustomer,
    addParcelImage: addParcelImage,
    deleteParcelImage: deleteParcelImage,
    assignCarryrToTheParcel: assignCarryrToTheParcel,
    bookThisParcel: bookThisParcel,
    cancelThisParcel: cancelThisParcel,
    getOpenParcels: getOpenParcels,
    getParcels: getParcels,
    initiatePickup: initiatePickup,
    pickup: pickup,
    initiateDelivery: initiateDelivery,
    deliver: deliver
};
