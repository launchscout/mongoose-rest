/*!
 * Chris O'Hara
 * Copyright(c) 2011 Chris O'Hara <cohara87@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var models = require('./models')
  , fs = require('fs')
  , lingo = require('lingo').en;

/**
 * Convert a lowercase, underscored string to a proper cased class name.
 * e.g. "my_table" => "MyTable"
 *
 * @param {string} table
 * @return {string} class
 * @api private
 */

function classify (str) {
    return str.replace('_', ' ').replace(/(^| )[a-z]/g, function (str) {
        return str.toUpperCase();
    }).replace(' ', '');
}

/**
 * Recursively replace `_id` with `id` in an object.
 *
 * @param {object} instance
 * @api private
 */

function convertUnderscoreId (instance) {
    for (var attr in instance) {
        if (attr == '_id') {
            instance.id = instance[attr];
            delete instance._id;
        } else if (Array.isArray(instance[attr])) {
            instance[attr].forEach(function (child) {
                if (typeof child === 'object') {
                    convertUnderscoreId(child);
                }
            });
        } else if (typeof instance[attr] === 'object') {
            convertUnderscoreId(instance[attr]);
        }
    }
}

/**
 * Generate backbone models.
 *
 * @param {string} namespace (optional)
 * @return {string} backbone_javascript
 * @api public
 */

exports.generate = function (namespace) {
    namespace = namespace || '';

    var backbone = backboneCommon(namespace);

    models.getEmbedded().forEach(function (resource) {
        backbone += backboneEmbeddedModel(namespace, resource);
    });

    models.getTopLevel().forEach(function (resource) {
        backbone += backboneTopLevelModel(namespace,
                        resource, models.getChildren(resource));
    });

    return backbone;
}

/**
 * Generate express view helpers for creating backbone models and collections.
 *
 * @param {HTTPServer} app
 * @param {string} namespace (optional)
 * @api public
 */

exports.helpers = function (app, namespace) {

    namespace = namespace || '';

    app.dynamicHelpers({

        backboneModel: function (request, response) {
            return function (resource, var_name) {
                var singular = resource
                  , klass = namespace + classify(resource)
                  , instance = request.resource(resource);

                var_name = var_name || resource;

                if (instance.toJSONSafe) {
                    instance = instance.toJSONSafe();
                } else {
                    instance = instance.toJSON()
                }

                convertUnderscoreId(instance);

                var model = 'var '+var_name+' = '
                          + 'new '+klass+'(' + JSON.stringify(instance) + ');';

                return model;
            }
        }

      , backboneCollection: function (request, response) {
            return function (resource, var_name) {
                var singular = lingo.singularize(resource)
                  , klass = namespace + classify(singular)
                  , instances = request.resource(resource);

                var_name = var_name || resource;

                for (var i = 0, l = instances.length; i < l; i++) {
                    if (instances[i].toJSONSafe) {
                        instances[i] = instances[i].toJSONSafe();
                    } else {
                        instances[i] = instances[i].toJSON()
                    }

                    convertUnderscoreId(instances[i]);
                }

                var collection = 'var '+var_name+' = '
                               + 'new '+klass+'Collection(' + JSON.stringify(instances) + ');';

                return collection;
            }
        }

    });
}

/**
 * Generate backbone models and write to a file.
 *
 * @param {string} file
 * @param {string} namespace (optional)
 * @api public
 */

exports.generateFile = function (file, namespace) {
    fs.writeFileSync(file, exports.generate(namespace));
}

/**
 * Generate common backbone code.
 *
 * @param {string} namespace (optional)
 * @api private
 */

function backboneCommon (namespace) {
    return 'var '+namespace+'Model = Backbone.Model.extend({\n'
         + '    set: function (attributes, options) {\n'
         + '        Backbone.Model.prototype.set.call(this, '
         +              'attributes, options);\n'
         + '        this.pullEmbedded();\n'
         + '    }\n'
         + '  , pullEmbedded: function () {\n'
         + '        for (var attr in this.attributes) {\n'
         + '            if (this[attr] && this[attr] instanceof Backbone.Collection) {\n'
         + '                for (var i = 0, models = [], model = this[attr].model, '
         +                          'l = this.attributes[attr].length; i < l; i++) {\n'
         + '                    models.push(new model(this.attributes[attr][i]));\n'
         + '                }\n'
         + '                this[attr].reset(models);\n'
         + '                delete this.attributes[attr];\n'
         + '            }\n'
         + '        }\n'
         + '    }\n'
         + '});\n'
         + '\n\n'
         + 'var '+namespace+'Collection = Backbone.Collection.extend({});\n\n';
}

/**
 * Generate backbone code for embedded models.
 *
 * @param {string} namespace (optional)
 * @api private
 */

function backboneEmbeddedModel (namespace, resource) {
    var singular = namespace + classify(lingo.singularize(resource));

    return 'var '+singular+' = '+namespace+'Model.extend({})\n'
         + '  , '+singular+'Collection = '
         + namespace+'Collection.extend({ model: '+singular+' });\n\n';
}

/**
 * Generate backbone code for top level models.
 *
 * @param {string} namespace (optional)
 * @api private
 */

function backboneTopLevelModel (namespace, resource, children) {
    var singular = namespace + classify(lingo.singularize(resource))
      , plural = lingo.pluralize(resource)
      , backbone = '';

    backbone += 'var '+singular+' = Model.extend({\n'
              + '    urlRoot: \'/'+plural+'\'\n';

    if (models.hasChildren(resource)) {
        backbone += '  , initialize: function () {\n';
        models.getChildren(resource).forEach(function (em) {
            backbone += '        this.'+em.attribute+' = new '
                      + namespace + classify(em.singular) + 'Collection;\n'
                      + '        this.'+em.attribute+'.url = \'/'+plural
                      + '/\' + this.id + \'/'+em.plural+'\'\n';
        });
        backbone += '        this.pullEmbedded();\n'
                  + '    }\n';
    }

    backbone += '});\n\n';

    backbone += 'var ' + singular + 'Collection = Collection.extend({\n'
              + '    model: ' + singular + '\n'
              + '  , url: \'/' + plural + '\'\n'
              + '});\n\n';

    return backbone;
}

