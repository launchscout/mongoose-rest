/*!
 * Chris O'Hara
 * Copyright(c) 2011 Chris O'Hara <cohara87@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var models = require('./models')
  , lingo = require('lingo').en;

/**
 * The MongoDB ID format.
 */

var id_format = /^[0-9a-f]{24}$/;

/**
 * Add RESTful routes.
 *
 * @param {HTTPServer} app
 * @param {object} routes
 * @param {string} prefix
 * @param {string} singular
 * @api private
 */

function addRoutes (app, routes, prefix, singular) {
    app.get    ( prefix + '.:format?'                   , routes.index  );
    app.post   ( prefix                                 , routes.create );
    app.get    ( prefix + '/:' + singular + '.:format?' , routes.read   );
    app.put    ( prefix + '/:' + singular               , routes.update );
    app.delete ( prefix + '/:' + singular               , routes.destroy);
}

/**
 * Create resource-based, RESTful routes for mongoose models.
 * All models must be defined before calling this method.
 *
 * @param {HTTPServer} app
 * @param {object} config (optional)
 * @api public
 */

exports.create = function (app, config) {
    config = config || {};

    //Set config defaults
    config.default_limit = config.default_limit || 20
    config.max_limit = config.max_limit || 100;

    //Add routes for each top level model
    models.getTopLevel().forEach(function (resource) {

        var singular = lingo.singularize(resource)
          , plural = lingo.pluralize(resource)
          , top_prefix = (config.path || '/') + plural
          , routes;

        //Autoload a resource when the param is part of a route
        autoloadTopLevelResource(app, resource, config);

        //Add RESTful routes
        routes = topLevelRoutes(app, top_prefix, resource, config);

        addRoutes(app, routes, top_prefix, singular);

        //Add routes for embedded documents
        models.getChildren(resource).forEach(function (embedded) {

            var prefix = top_prefix + '/:' + singular;

            autoloadEmbeddedResource(app, resource,
                embedded.resource, embedded.attribute, config);

            routes = embeddedRoutes(app, prefix, resource, embedded.resource,
                                        embedded.attribute);

            addRoutes(app, routes, prefix + '/' + embedded.plural, embedded.singular);

        });

    });

    app.dynamicHelpers({resource: function (request, response) {
        return request.resource;
    }});
}

/**
 * Autoload a resource when a route contains it as a parameter, e.g.
 * /posts/:post will automatically load the requested post, where :post
 * is either an ID or unique slug, e.g. /posts/my-test-post or /posts/23
 *
 * @param {HTTPServer} app
 * @param {string} resource
 * @param {object} config (optional)
 * @api private
 */

function autoloadTopLevelResource (app, resource, config) {
    var model = models.mongoose.model(resource)
      , singular = lingo.singularize(resource);

    app.param(singular, function (request, response, next) {
        var id = request.params[singular];

        function handleResource (err, obj) {
            if (err) {
                return next(new Error(err));
            } else if (null == obj) {
                if (request.xhr || request.format) {
                    response.send(404);
                } else {
                    request.flash('error', 'The %s could not be found.', singular);
                    response.redirect('back');
                }
            } else {
                request.resource(singular, obj);
                next();
            }
        }

        //Is there a unique slug attribute we can lookup by? If not, lookup by ID
        if (model.schema.tree.slug && !id_format.test(id)) {
            model.findOne({slug: id}, handleResource);
        } else {
            model.findById(id, handleResource);
        }
    });
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
 * @param {object} config (optional)
 * @api private
 */

function autoloadEmbeddedResource (app, parent, resource, attribute, config) {
    var model = models.mongoose.model(resource)
      , singular = lingo.singularize(resource)
      , parent_singular = lingo.singularize(parent);

    app.param(singular, function (request, response, next) {
        var parent = request.resource(parent_singular)
          , id = request.params[singular];
        if (parent && attribute in parent) {
            parent[attribute].forEach(function (child) {
                if (child.get('id') == id) {
                    request.resource(singular, child);
                    return next();
                }
            });
        } else if (request.xhr || request.format) {
            response.send([]);
        } else {
            request.flash('error', 'The %s could not be found.', singular);
            response.redirect('back');
        }
    });
}

/**
 * Generate routes for top level models.
 *
 * @param {HTTPServer} app
 * @param {string} resource
 * @param {object} config (optional)
 * @return {object} routes
 * @api private
 */

function topLevelRoutes (app, prefix, resource, config) {

    var model = models.mongoose.model(resource)
      , singular = lingo.singularize(resource)
      , plural = lingo.pluralize(resource)
      , routes = {};

    //GET /<resource>
    routes.index = function (request, response, next) {
        var page = request.query.page || 1
          , limit = Math.min(config.max_limit, request.query.limit
                                                   || config.default_limit)
          , sort = request.query.order || 'id'
          , desc = request.query.desc || false
          , offset = (page - 1) * limit
          , locals = {}
          , query;

        function doQuery(query) {
            if (request.query.order) {
                query = query.sort([[
                    request.query.order, request.query.desc ? 'descending'
                                                            : 'ascending'
                ]]);
            }
            query.skip(offset).limit(limit).run(function (err, results) {
                if (err) {
                    return next(new Error(err));
                } else if (request.xhr || request.format === 'json') {
                    return response.send(results || []);
                }
                var locals = {
                    limit  : limit
                  , page   : page
                  , offset : offset
                  , sort   : sort
                  , query  : query
                }
                locals[plural] = results || [];
                response.locals(locals);
                request.resource(plural, results);
                response.render(plural + '/index');
            });
        }

        //Use the static search() method if it's defined
        if (model.search) {
            model.search(request.query, request.user, function (err, query) {
                if (err) {
                    return next(new Error(err));
                }
                doQuery(query);
            });
        } else {
            doQuery(model.find());
        }
    }

    //POST /<resource>
    routes.create = function (request, response, next) {
        var attr, instance = new model();
        for (attr in request.body) {
            if (!(attr in model.schema.tree)) {
                delete request.body[attr];
            }
        }
        if (model.filter) {
            request.body = model.filter(request.body);
        }
        for (attr in request.body) {
            instance[attr] = request.body[attr];
        }
        instance.save(function (err) {
            if (err) {
                    return next(new Error(err));
            } else if (request.xhr || request.format === 'json') {
                return response.send(instance);
            }
            request.flash('info', 'The %s was created successfully', singular);
            response.redirect('/' + plural);
        });
    }

    //GET /<resource>/:id
    routes.read = function (request, response, next) {
        if (request.xhr || request.format === 'json') {
            return response.send(request.resource(singular).toJSON());
        }
        response.local('instance', request.resource(singular));
        response.render(plural + '/read');
    }

    //PUT /<resource>/:id
    routes.update = function (request, response, next) {
        var attr, instance = request.resource(singular);
        for (attr in request.body) {
            if (!(attr in model.schema.tree)) {
                delete request.body[attr];
            }
        }
        if (model.filter) {
            request.body = model.filter(request.body);
        }
        for (attr in request.body) {
            instance[attr] = request.body[attr];
        }
        instance.save(function (err) {
            if (err) {
                return next(new Error(err));
            } else if (request.xhr || request.format === 'json') {
                return response.send(instance);
            }
            request.flash('info', 'The %s was updated successfully', singular);
            response.redirect('/' + plural + '/' + request.params.id);
        });
    }

    //DELETE /<resource>/:id
    routes.destroy = function (request, response, next) {
        request.resource(singular).remove(function (err) {
            if (err) {
                return next(new Error(err));
            } else if (request.xhr || request.format === 'json') {
                return response.send(200);
            }
            request.flash('info', 'The %s was removed successfully', singular);
            response.redirect('/' + plural);
        });
    }

    //If there's a static acl() method, patch each action to route through it
    if (model.acl) {
        for (var action in routes) {
            (function (action, handle) {
                routes[action] = function (request, response, next) {
                    var user = request.user || null
                      , obj = request.resource(singular) || request.body;
                    model.acl(user, action, obj, function (ok) {
                        if (!ok) next(new Error('auth'));
                        else handle(request, response, next);
                    });
                }
            })(action, routes[action]);
        }
    }

    return routes;
}

/**
 * Generate routes for embedded documents.
 *
 * @param {HTTPServer} app
 * @param {string} prefix
 * @param {string} parent
 * @param {string} resource
 * @param {string} attribute
 * @param {object} config (optional)
 * @return {object} routes
 * @api private
 */

function embeddedRoutes (app, prefix, parent_resource, resource, attribute) {

    var model = models.mongoose.model(resource)
      , plural = lingo.pluralize(resource)
      , singular = lingo.singularize(resource)
      , parent_model = models.mongoose.model(parent_resource)
      , parent_plural = lingo.pluralize(parent_resource)
      , parent_singular = lingo.singularize(parent_resource)
      , routes = {};

    prefix += '/' + plural;

    //GET /<parent_resource>/:parent_id/<resource>
    routes.index = function (request, response, next) {
        var parent = request.resource(parent_singular)
          , children = [];

        if (parent[attribute] && parent[attribute].length) {
            parent[attribute].forEach(function (child) {
                //Convert each child to a JSON string
                var obj = child.toJSON();
                obj.id = obj._id;
                delete obj._id;
                children.push(obj);
            });
        }
        return response.send(children);
    }

    //POST /<parent_resource>/:parent_id/<resource>/:id
    routes.create = function (request, response, next) {
        var parent = request.resource(parent_singular)
          , child = new model();
        if (!parent[attribute]) {
            parent[attribute] = [];
        }
        for (attr in request.body) {
            if (attr in model.schema.tree) {
                child[attr] = request.body[attr];
            }
        }
        parent[attribute].push(child);
        parent.save(function (err) {
            if (err) {
                return next(new Error(err));
            }
            response.send(child.toJSON());
        });
    }

    //GET /<parent_resource>/:parent_id/<resource>/:id
    routes.read = function (request, response, next) {
        var instance = request.resource(singular);
        response.send(instance);
    }

    //PUT /<parent_resource>/:parent_id/<resource>/:id
    routes.update = function (request, response, next) {
        var instance = request.resource(singular)
          , parent = request.resource(parent_singular);
        for (attr in request.body) {
            if (attr in model.schema.tree) {
                instance[attr] = request.body[attr];
            }
        }
        parent.save(function (err) {
            if (err) {
                return next(new Error(err));
            }
            response.send(200);
        });
    }

    //DELETE /<parent_resource>/:parent_id/<resource>/:id
    routes.destroy = function (request, response, next) {
        var instance = request.resource(singular)
          , parent = request.resource(parent_singular);
        instance.remove();
        parent.save(function (err) {
            if (err) {
                return next(new Error(err));
            }
            response.send(200);
        });
    }

    //Run each embedded document route through the parent's acl() method
    if (parent_model.acl) {
        for (var action in routes) {
            (function (action, handle) {
                routes[action] = function (request, response, next) {
                    var user = request.user || null
                      , obj = request.resource(singular) || request.body;
                    parent_model.acl(user, action, obj, function (ok) {
                        if (!ok) next(new Error('auth'));
                        else handle(request, response, next);
                    });
                }
            })(action, routes[action]);
        }
    }

    return routes;
}

