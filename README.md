**mongoose-rest** - Generate RESTful, resource-based routes for your Mongoose models.

```bash
$ npm install mongoose-rest
```

## Usage

```javascript
var mongoose = require('mongoose')
  , app = require('express').createServer()
  , rest = require('mongoose-rest');

//Define your schemas

rest.use(mongoose);
rest.createRoutes(app, config);
```

This will add two types of routes depending on your document structure

**Top level routes**

```
Method  Route                     Action
GET     /<resource>.:format?      index
POST    /<resource>               create
GET     /<resource>/:id.:format?  read
PUT     /<resource>/:id           update
DELETE  /<resource>/:id           delete
```

**Embedded routes**

```
Method  Route                                         Action
GET     /<parent>/:parent_id/<resource>.:format?      index
POST    /<parent>/:parent_id/<resource>               create
GET     /<parent>/:parent_id/<resource>/:id.:format?  read
PUT     /<parent>/:parent_id/<resource>/:id           update
DELETE  /<parent>/:parent_id/<resource>/:id           delete
```

*Note: Currently only one level of embedded documents is supported.*

## Access Control

If a static `acl()` method is defined on the schema, each route will pass through it

```
Post.acl(user, action, post, allowed) {
    //Only logged in users may see posts
    if (!user) allowed(false);

    //Only the posting user may update or delete the post
    if (action == 'update' || action == 'delete') {
        allowed(post.get('user') == user.get('id'));
    }
});
```

## Search

The *index* action uses the static `search()` method if it's defined on
the schema, otherwise it defaults to `find()`.

TODO

## Slugs

TODO

## Backbone models

This is an experimental feature.

```javascript
rest.generateBackboneFile('/path/to/output.js', namespace);
```

Then serve the `.js` file as normal.

## License

Copyright (c) 2011 Chris O'Hara <cohara87@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

