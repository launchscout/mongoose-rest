docs:
	@dox --title 'mongoose-rest' -p lib/request.js lib/models.js lib/rest.js lib/backbone.js > api.html

.PHONY: docs
