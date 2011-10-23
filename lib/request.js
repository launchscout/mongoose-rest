/*!
 * Chris O'Hara
 * Copyright(c) 2011 Chris O'Hara <cohara87@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var http = require('http')
  , request = http.IncomingMessage.prototype

/**
 * Bind a resource to the request.
 *
 * @param {string} name
 * @param {object} resource
 * @api public
 */

request.resource = function (name, resource) {
    if (arguments.length == 2) {
        this.resources = this.resource || {}
        return this.resources[name] = resource
    } else if (this.resources && name in this.resources) {
        return this.resources[name]
    }
    return null
}

/**
 * Check if the request has the specified resource.
 *
 * @param {string} name
 * @api public
 */

request.hasResource = function (name) {
    return this.resources && name in this.resources
}

