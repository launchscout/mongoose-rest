var models = require('./lib/models')
  , backbone = require('./lib/backbone')
  , rest = require('./lib/rest');

//Patch IncomingMessage.prototype
require('./lib/request');

exports.use = function (app, mongoose) {
    models.use(mongoose)
    rest.autoloadResources(app)
    backbone.helpers(app)
}

exports.routes = rest.routes

module.exports.backbone = backbone.generateFile

