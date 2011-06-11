var models = require('./lib/models')
  , backbone = require('./lib/backbone')
  , rest = require('./lib/rest');

//Patch IncomingMessage.prototype
require('./lib/request');

module.exports = models;
module.exports.createRoutes = rest.create;
module.exports.generateBackbone = backbone.generate;
module.exports.generateBackboneFile = backbone.generateFile;

