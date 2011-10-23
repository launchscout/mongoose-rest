/*!
 * Chris O'Hara
 * Copyright(c) 2011 Chris O'Hara <cohara87@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var models = require('./models')
  , lingo = require('lingo').en

/**
 * The MongoDB ID format.
 */

exports.id_format = /^[0-9a-f]{24}$/

/**
 * Cache generated routes.
 */

exports.cached_routes = null

/**
 * Select defaults.
 */

exports.default_limit = 20
exports.max_limit = 1000

/**
 * Convert an instance to a JSON safe object.
 */

function toJSON (resource) {
    var json = resource.json ? resource.json() : resource.toJSON()
    fixIds(json)
    return json
}

/**
 * Recursively replace _id with id.
 */

function fixIds (obj) {
    if (!obj) {
        return
    } else if (Array.isArray(obj)) {
        obj.forEach(fixIds)
    } else if (typeof obj === 'object') {
        for (var i in obj) {
            if (obj.hasOwnProperty(i)) {
                fixIds(obj[i])
            }
        }
        if ('_id' in obj) {
            obj.id = obj._id
            delete obj._id
        }
    }
}

/**
 * Generate RESTful routes for all models.
 *
 * @return {object} routes
 * @api public
 */

exports.routes = function () {
    if (!exports.cached_routes) {
        var routes = exports.cached_routes = {}

        //Create routes for each top level model
        models.getTopLevel().forEach(function (resource) {
            var plural = lingo.pluralize(resource)
              , parent = routes[plural] = topLevelRoutes(resource)

            parent.embedded = {}

            //Create routes for embedded documents
            models.getChildren(resource).forEach(function (embedded) {
                parent.embedded[embedded.attribute] = embeddedRoutes(resource,
                    embedded.resource, embedded.attribute)
            })

        })
    }

    return exports.cached_routes
}

/**
 * Autoload resources when they're part of a route, e.g. /posts/:post
 * or any other route with the ":post" param will automatically load
 * the resource  - accessible via request.resource('post')
 *
 * @param {HTTPServer} app
 * @api public
 */

exports.autoloadResources = function (app) {
    models.getTopLevel().forEach(function (resource) {
        autoloadTopLevelResource(app, resource)

        models.getChildren(resource).forEach(function (embedded) {
            autoloadEmbeddedResource(app, resource, embedded.resource, embedded.attribute)
        })
    })

    app.dynamicHelpers({resource: function (request, response) {
        return request.resource
    }})

    app.param('format', function (request, response, next) {
        request.format = request.params.format
        if (request.format != 'json') {
            return response.send(403)
        }
        next()
    })
}

/**
 * Autoload a resource when a route contains it as a parameter, e.g.
 * /posts/:post will automatically load the requested post, where :post
 * is either an ID or unique slug, e.g. /posts/my-test-post or /posts/23
 *
 * @param {HTTPServer} app
 * @param {string} resource
 * @api private
 */

function autoloadTopLevelResource (app, resource) {
    var model = models.mongoose.model(resource)
      , singular = lingo.singularize(resource)
      , dbrefs = models.getDbrefAttributes(resource)

    app.param(singular, function (request, response, next) {
        var id = request.params[singular]
          , query

        request.body = request.body || {}

        function handleResource (err, obj) {
            if (err) {
                return next(new Error(err))
            } else if (null == obj) {
                if (request.xhr || request.format) {
                    response.send(404)
                } else {
                    request.flash('error', 'The %s could not be found.', singular)
                    response.redirect('back')
                }
            } else {
                request.resource(singular, obj)
                next()
            }
        }

        //Is there a unique slug attribute we can lookup by? If not, lookup by ID
        if (model.schema.tree.slug && !exports.id_format.test(id)) {
            query = model.findOne({slug: id})
        } else {
            query = model.findById(id)
        }

        //Populate DBRefs?
        if (dbrefs.length) {
            dbrefs.forEach(function (attr) {
                query.populate(attr)
            })
        }

        query.run(handleResource)
    })
}

/**
 * Autoload an embedded resource when a route contains it as a parameter, e.g.
 * /posts/:post/commments/:comment will automatically load the requested
 * comment (assuming the post has already been loaded).
 *
 * @param {HTTPServer} app
 * @param {string} parent
 * @param {string} resource
 * @param {string} attribute - the attribute name of the embedded resource
 * @api private
 */

function autoloadEmbeddedResource (app, parent, resource, attribute) {
    var model = models.mongoose.model(resource)
      , singular = lingo.singularize(resource)
      , parent_singular = lingo.singularize(parent)

    app.param(singular, function (request, response, next) {
        var parent = request.resource(parent_singular)
          , id = request.params[singular]
        if (parent && attribute in parent) {
            parent[attribute].forEach(function (child) {
                if (child.get('id') == id) {
                    request.resource(singular, child)
                    return next()
                }
            })
        } else if (request.xhr || request.format) {
            response.send([])
        } else {
            request.flash('error', 'The %s could not be found.', singular)
            response.redirect('back')
        }
    })
}

/**
 * Generate routes for top level models.
 *
 * @param {string} resource
 * @api private
 */

function topLevelRoutes (resource) {

    var model = models.mongoose.model(resource)
      , singular = lingo.singularize(resource)
      , plural = lingo.pluralize(resource)
      , routes = {}

    //GET /<resource>
    routes.index = function (request, response, next) {
        var page = parseInt(request.query.page) || 1
          , limit = Math.min(exports.max_limit, request.query.limit
                                                   || exports.default_limit)
          , offset = (page - 1) * limit
          , locals = {}
          , query

        function doQuery(query) {
            query.skip(offset).limit(limit).run(function (err, results) {
                if (err) {
                    return next(new Error(err))
                } else if (request.xhr || request.format) {
                    var elements = [];
                    (results || []).forEach(function (element) {
                        elements.push(toJSON(element));
                    });
                    return response.send(elements);
                }
                var locals = {
                    limit  : limit
                  , page   : page
                  , offset : offset
                  , query  : request.query
                }
                locals[plural] = results || []
                response.locals(locals)
                request.resource(plural, results)
                next()
            })
        }

        //Use Model.search() if it's defined
        if (model.search) {
            model.search(request.query, request.user, function (err, query) {
                if (err) {
                    return next(new Error(err))
                }
                doQuery(query)
            })
        } else {
            query = model.find()
            if (request.query.order) {
                query = query.sort([[
                    request.query.order, request.query.desc ? 'descending'
                                                            : 'ascending'
                ]])
            }
            doQuery(query)
        }
    }

    //POST /<resource>
    routes.create = function (request, response, next) {
        var attr, instance = new model()
        for (attr in request.body) {
            if (!(attr in model.schema.tree)) {
                delete request.body[attr]
            }
        }
        for (attr in request.body) {
            instance[attr] = request.body[attr]
        }
        instance.save(function (err) {
            var id = model.schema.tree.slug ? instance.get('slug') : instance.get('id')
            if (err) {
                return next(new Error(err))
            }
            next()
        })
    }

    //GET /<resource>/:id
    routes.show = function (request, response, next) {
        if (request.xhr || request.format) {
            return response.send(toJSON(request.resource(singular)))
        }
        response.local('instance', request.resource(singular))
        next()
    }

    //PUT /<resource>/:id
    routes.update = function (request, response, next) {
        var attr, instance = request.resource(singular)

        //Remove attributes not defined on the schema
        for (attr in request.body) {
            if (!(attr in model.schema.tree)) {
                delete request.body[attr]
            }
        }

        //Fix array attributes in request.body
        models.getArrayAttributes(resource).forEach(function (attr) {
            if (attr in request.body && !Array.isArray(request.body[attr])) {
                //Make it an array if it's just a single value
                request.body[attr] = [request.body[attr]]
            }
        })

        //Check if the update requires an add/remove operation on
        //the same array attribute as these must be done separately.
        //See https://jira.mongodb.org/browse/SERVER-1050

        var requires_SERVER1050_fix = false
          , array_attributes = models.getArrayAttributes(resource)

        array_attributes.forEach(function (attr) {
            if (!Array.isArray(instance[attr]) || !(attr in request.body)) {
                return;
            }

            var added = removed = false
            instance[attr].forEach(function (elem) {
                if (typeof elem === 'object') {
                    return; //Deep equals is unsupported
                }
                if (request.body[attr].indexOf(elem) === -1) {
                    removed = true
                }
            });

            request.body[attr].forEach(function (elem) {
                if (typeof elem === 'object' || instance[attr].indexOf(elem) === -1) {
                    added = true
                    instance[attr].push(elem)
                }
            });

            if (added && removed) {
                requires_SERVER1050_fix = true
            } else {
                instance[attr] = request.body[attr]
            }
        })

        //Copy over other attributes
        for (attr in instance) {
            if (array_attributes.indexOf(attr) !== -1) {
                continue;
            }
            if (attr in request.body) {
                instance[attr] = request.body[attr]
            }
        }

        function callback (err) {
            if (err) {
                return next(new Error(err))
            } else if (request.xhr || request.format) {
                return response.send(toJSON(instance))
            }
            next()
        }

        if (!requires_SERVER1050_fix) {
            return instance.save(callback)
        }

        instance.save(function (err) {
            if (err) {
                return next(new Error(err))
            }

            //Copy over all attributes now
            for (attr in instance) {
                if (attr in request.body) {
                    instance[attr] = request.body[attr]
                }
            }

            instance.save(callback)
        })
    }

    //DELETE /<resource>/:id
    routes.destroy = function (request, response, next) {
        request.resource(singular).remove(function (err) {
            if (err) {
                return next(new Error(err))
            } else if (request.xhr || request.format) {
                return response.send(200)
            }
            next()
        })
    }

    //If there's a static acl() method, patch each action to route through it
    if (model.acl) {
        for (var action in routes) {
            (function (action, handle) {
                routes[action] = function (request, response, next) {
                    var obj = request.resource(singular) || request.body
                    model.acl(request, action, obj, function (ok) {
                        if (ok) {
                            return handle(request, response, next)
                        } else if (request.xhr || request.format) {
                            return response.send(403)
                        }
                        next(new Error('auth'))
                    })
                }
            })(action, routes[action])
        }
    }

    return routes
}

/**
 * Generate routes for embedded documents.
 *
 * @param {string} parent
 * @param {string} resource
 * @param {string} attribute
 * @return {object} routes
 * @api private
 */

function embeddedRoutes (parent_resource, resource, attribute) {

    var model = models.mongoose.model(resource)
      , plural = lingo.pluralize(resource)
      , singular = lingo.singularize(resource)
      , parent_model = models.mongoose.model(parent_resource)
      , parent_plural = lingo.pluralize(parent_resource)
      , parent_singular = lingo.singularize(parent_resource)
      , routes = {}

    //GET /<parent_resource>/:parent_id/<resource>
    routes.index = function (request, response, next) {
        var parent = request.resource(parent_singular)
          , children = []

        if (parent[attribute] && parent[attribute].length) {
            parent[attribute].forEach(function (child) {
                children.push(toJSON(child))
            })
        }
        return response.send(children)
    }

    //POST /<parent_resource>/:parent_id/<resource>/:id
    routes.create = function (request, response, next) {
        var parent = request.resource(parent_singular)
          , child = new model()
        if (!parent[attribute]) {
            parent[attribute] = []
        }
        for (attr in request.body) {
            if (attr in model.schema.tree) {
                child[attr] = request.body[attr]
            }
        }
        parent[attribute].push(child)
        parent.save(function (err) {
            if (err) {
                return next(new Error(err))
            }
            response.send(toJSON(child))
        })
    }

    //GET /<parent_resource>/:parent_id/<resource>/:id
    routes.show = function (request, response, next) {
        var instance = request.resource(singular)
        response.send(toJSON(instance))
    }

    //PUT /<parent_resource>/:parent_id/<resource>/:id
    routes.update = function (request, response, next) {
        var instance = request.resource(singular)
          , parent = request.resource(parent_singular)
        for (attr in request.body) {
            if (attr in model.schema.tree) {
                instance[attr] = request.body[attr]
            }
        }
        parent.save(function (err) {
            if (err) {
                return next(new Error(err))
            }
            response.send(200)
        })
    }

    //DELETE /<parent_resource>/:parent_id/<resource>/:id
    routes.destroy = function (request, response, next) {
        var instance = request.resource(singular)
          , parent = request.resource(parent_singular)
        instance.remove()
        parent.save(function (err) {
            if (err) {
                return next(new Error(err))
            }
            response.send(200)
        })
    }

    //Run each embedded document route through the parent's acl() method
    if (parent_model.acl) {
        for (var action in routes) {
            (function (action, handle) {
                routes[action] = function (request, response, next) {
                    var obj = request.resource(singular) || request.body
                    parent_model.acl(request, action, obj, function (ok) {
                        if (ok) {
                            return handle(request, response, next)
                        } else if (request.xhr || request.format) {
                            return response.send(403)
                        }
                        next(new Error('auth'))
                    })
                }
            })(action, routes[action])
        }
    }

    return routes
}

