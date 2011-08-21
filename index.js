var models = require('./lib/models')
  , backbone = require('./lib/backbone')
  , rest = require('./lib/rest');

//Patch IncomingMessage.prototype
require('./lib/request');

module.exports = models;
module.exports.createRoutes = rest.create;
module.exports.id_format = rest.id_format;
module.exports.createEmbeddedRoutes = rest.createEmbedded;
module.exports.autoloadResources = rest.autoloadResources;
module.exports.generateBackbone = backbone.generate;
module.exports.backboneHelpers = backbone.helpers;
module.exports.generateBackboneFile = backbone.generateFile;

