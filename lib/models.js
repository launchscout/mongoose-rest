/*!
 * Chris O'Hara
 * Copyright(c) 2011 Chris O'Hara <cohara87@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var lingo = require('lingo').en;

/**
 * The schema map.
 */

var embedded = [], top_level = []
  , child_map = {}
  , parent_map = {};

/**
 * The mongoose instance in use.
 */

exports.mongoose = null;

/**
 * A hacky way of mapping attributes => names.
 *
 * @param {Schema} schema
 * @return {string} key
 * @api private
 */

function attrKey(schema) {
    return Object.keys(schema.tree).join('-');
}

/**
 * Build a schema map.
 *
 * @param {Mongoose} mongoose
 * @api public
 */

exports.use = function (mongoose) {

    exports.mongoose = mongoose;

    var key, model, attr, schema, attr_map = {};

    //Create a map of attributes => model name
    for (model in mongoose.modelSchemas) {
        schema = mongoose.modelSchemas[model];
        key = attrKey(schema);
        if (key in attr_map) {
            console.error('WARNING: Two or more schemas have the same attributes.');
            process.exit(1)
        }
        attr_map[key] = model;
    }

    //Work out which document schemas are embedded inside others
    for (model in mongoose.modelSchemas) {
        schema = mongoose.modelSchemas[model];
        child_map[model] = [];
        for (attr in schema.tree) {
            (function (attr) {
                if (Array.isArray(schema.tree[attr]) && schema.tree[attr][0].path) {
                    key = attrKey(schema.tree[attr][0]);
                    resource = attr_map[key];
                    child_map[model].push({
                        attribute : attr
                      , resource  : resource
                      , singular  : lingo.singularize(resource)
                      , plural    : lingo.pluralize(resource)
                    });
                    embedded.push(resource);
                    if (!(resource in parent_map)) {
                        parent_map[resource] = [];
                    }
                    parent_map[resource].push({
                        attribute : attr
                      , resource  : model
                      , singular  : lingo.singularize(model)
                      , plural    : lingo.pluralize(model)
                    });
                }
            }(attr));
        }
    }

    //Work out which resources are top level
    Object.keys(mongoose.modelSchemas).forEach(function (resource) {
        if (!~embedded.indexOf(resource)) {
            top_level.push(resource);
        }
    });

}

/**
 * Get top level resources.
 *
 * @return {array} resources
 * @api public
 */

exports.getTopLevel = function () {
    return top_level;
}

/**
 * Get embedded resources.
 *
 * @return {array} resources
 * @api public
 */

exports.getEmbedded = function () {
    return embedded;
}

/**
 * Get a map of parent => children resources.
 *
 * @return {array} map
 * @api public
 */

exports.getChildMap = function () {
    return child_map;
}

/**
 * Get a map of child => parent resources.
 *
 * @return {array} map
 * @api public
 */

exports.getParentMap = function () {
    return parent_map;
}

/**
 * Check whether a resource is top level.
 *
 * @return {boolean} is_top_level
 * @api public
 */

exports.isTopLevel = function (resource) {
    return exports.getTopLevel().indexOf(resource) !== -1;
}

/**
 * Check whether a resource is embedded in another.
 *
 * @return {boolean} is_embedded
 * @api public
 */

exports.isEmbedded = function (resource) {
    return exports.getEmbedded().indexOf(resource) !== -1;
}

/**
 * Get the children of the specified resource.
 *
 * @return {array} children
 * @api public
 */

exports.getChildren = function (resource) {
    return exports.getChildMap()[resource] || [];
}

/**
 * Get the parents of the specified resource.
 *
 * @return {array} children
 * @api public
 */

exports.getParents = function (resource) {
    return exports.getParentMap()[resource] || [];
}

/**
 * Check whether the resource has embedded resources.
 *
 * @return {boolean} has_children
 * @api public
 */

exports.hasChildren = function (resource) {
    return exports.getChildMap()[resource] && exports.getChildMap()[resource].length;
}

/**
 * Check whether the resource is embedded in others.
 *
 * @return {boolean} has_parents
 * @api public
 */

exports.hasParents = function (resource) {
    return exports.getParentMap()[resource] && exports.getParentMap()[resource].length;
}

/**
 * Get model attributes.
 *
 * @return {string} resource
 * @api public
 */

exports.getAttributes = function (resource) {
    var schemas = exports.mongoose.modelSchemas
    return Object.keys(schemas[resource].tree)
}

/**
 * Get model attributes that are arrays.
 *
 * @return {string} resource
 * @api public
 */

exports.getArrayAttributes = function (resource) {
    var arr = []
      , schemas = exports.mongoose.modelSchemas
      , tree = schemas[resource].tree

    for (var attr in tree) {
        if (Array.isArray(tree[attr])) {
            arr.push(attr)
        }
    }

    return arr
}

/**
 * Get model attributes that are DBRefs.
 *
 * @return {string} resource
 * @api public
 */

exports.getDbrefAttributes = function (resource) {
    var arr = []
      , schemas = exports.mongoose.modelSchemas
      , tree = schemas[resource].tree

    for (var attr in tree) {
        if (typeof tree[attr] === 'object' && tree[attr].ref) {
            arr.push(attr)
        }
    }

    return arr
}

