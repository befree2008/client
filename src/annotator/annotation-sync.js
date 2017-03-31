'use strict';

// AnnotationSync listens for messages from the sidebar app indicating that
// annotations have been added or removed and relays them to Annotator.
//
// It also listens for events from Annotator when new annotations are created or
// annotations successfully anchor and relays these to the sidebar app.
function AnnotationSync(bridge, options) {
  var event;
  var func;
  var handler;
  var method;

  this.bridge = bridge;

  if (!options.on) {
    throw new Error('options.on unspecified for AnnotationSync.');
  }

  if (!options.emit) {
    throw new Error('options.emit unspecified for AnnotationSync.');
  }

  this.cache = {};

  this._on = options.on;
  this._emit = options.emit;

  // Listen locally for interesting events
  for (event in this._eventListeners) {
    if (Object.prototype.hasOwnProperty.call(this._eventListeners, event))  {
      handler = this._eventListeners[event];
      this._on(event, handler.bind(this));
    }
  }

  // Register remotely invokable methods
  for (method in this._channelListeners) {
    if (Object.prototype.hasOwnProperty.call(this._channelListeners, method))  {
      func = this._channelListeners[method];
      this.bridge.on(method, func.bind(this));
    }
  }
}

// Cache of annotations which have crossed the bridge for fast, encapsulated
// association of annotations received in arguments to window-local copies.
AnnotationSync.prototype.cache = null;

AnnotationSync.prototype.sync = function(annotations) {
  annotations = (function() {
    var i;
    var len;
    var results1;

    results1 = [];
    for (i = 0, len = annotations.length; i < len; i++) {
      results1.push(this._format(annotations[i]));
    }
    return results1;
  }).call(this);
  this.bridge.call('sync', annotations, (function(_this) {
    return function(err, annotations) {
      var i;
      var len;
      var results1;

      if (annotations === null) {
        annotations = [];
      }
      results1 = [];
      for (i = 0, len = annotations.length; i < len; i++) {
        results1.push(_this._parse(annotations[i]));
      }
      return results1;
    };
  })(this));
  return this;
};

// Handlers for messages arriving through a channel
AnnotationSync.prototype._channelListeners = {
  'deleteAnnotation': function(body, cb) {
    var annotation;
    annotation = this._parse(body);
    delete this.cache[annotation.$tag];
    this._emit('annotationDeleted', annotation);
    cb(null, this._format(annotation));
  },
  'loadAnnotations': function(bodies, cb) {
    var a;
    var annotations;

    annotations = (function() {
      var i;
      var len;
      var results1;

      results1 = [];
      for (i = 0, len = bodies.length; i < len; i++) {
        a = bodies[i];
        results1.push(this._parse(a));
      }
      return results1;
    }).call(this);
    this._emit('annotationsLoaded', annotations);
    return cb(null, annotations);
  },
};

// Handlers for events coming from this frame, to send them across the channel
AnnotationSync.prototype._eventListeners = {
  'beforeAnnotationCreated': function(annotation) {
    if (annotation.$tag) {
      return undefined;
    }
    return this._mkCallRemotelyAndParseResults('beforeCreateAnnotation')(annotation);
  },
};

AnnotationSync.prototype._mkCallRemotelyAndParseResults = function(method, callBack) {
  return (function(_this) {
    return function(annotation) {
      // Wrap the callback function to first parse returned items
      var wrappedCallback;
      wrappedCallback = function(failure, results) {
        if (failure === null) {
          _this._parseResults(results);
        }
        if (typeof callBack === 'function') {
          callBack(failure, results);
        }
      };
      // Call the remote method
      _this.bridge.call(method, _this._format(annotation), wrappedCallback);
    };
  })(this);
};

// Parse returned message bodies to update cache with any changes made remotely
AnnotationSync.prototype._parseResults = function(results) {
  var bodies;
  var body;
  var i;
  var j;
  var len;
  var len1;

  for (i = 0, len = results.length; i < len; i++) {
    bodies = results[i];
    bodies = [].concat(bodies);
    for (j = 0, len1 = bodies.length; j < len1; j++) {
      body = bodies[j];
      if (body !== null) {
        this._parse(body);
      }
    }
  }
};

// Assign a non-enumerable tag to objects which cross the bridge.
// This tag is used to identify the objects between message.
AnnotationSync.prototype._tag = function(ann, tag) {
  if (ann.$tag) {
    return ann;
  }
  tag = tag || window.btoa(Math.random());
  Object.defineProperty(ann, '$tag', {
    value: tag,
  });
  this.cache[tag] = ann;
  return ann;
};

// Parse a message body from a RPC call with the provided parser.
AnnotationSync.prototype._parse = function(body) {
  var local;
  var merged;
  var remote;

  local = this.cache[body.tag];
  remote = body.msg;
  merged = Object.assign(local || {}, remote);
  return this._tag(merged, body.tag);
};

// Format an annotation into an RPC message body with the provided formatter.
AnnotationSync.prototype._format = function(ann) {
  this._tag(ann);
  return {
    tag: ann.$tag,
    msg: ann,
  };
};

module.exports = AnnotationSync;
