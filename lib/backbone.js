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
    return str.replace('_', ' ').replace(/( |^)[a-z]/g, function (str) {
        return str.toLowerCase();
    }).replace(' ', '');
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
         + '        Backbone.Model.prototype.set.call(this,'
         + '            attributes, options);\n'
         + '        this.pullEmbedded();\n'
         + '    }\n'
         + '  , pullEmbedded: function () {\n'
         + '        for (var attr in this.attributes) {\n'
         + '            if (this[attr] && this[attr] instanceof Backbone.Collection) {\n'
         + '                for (var i = 0, models = [],\n'
         + '                        l = this.attributes[attr].length; i < l; i++) {\n'
         + '                    models.push(this[attr].create(this.attributes[attr][i]));\n'
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
      , plural = namespace + classify(lingo.pluralize(resource))
      , backbone = '';

    backbone += 'var '+singular+' = Model.extend({\n'
              + '    urlRoot: \'/'+plural+'\'\n';

    if (models.hasChildren(resource)) {
        backbone += '  , initialize: function () {\n';
        models.getChildren(resource).forEach(function (em) {
            backbone += '        this.'+em.attribute+' = new '
                      + namespace + classify(em.singular) + 'Collection;\n'
                      + '        this.'+em.attribute+'.url = \'/'+plural
                      + '/\' + this.id + \'/'+namespace +classify(em.plural)+'\'\n';
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

