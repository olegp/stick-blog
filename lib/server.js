var Application = require("stick").Application;
var markdown = require('github-flavored-markdown').parse;
var mongo = require("mongo-sync");

var app = exports.app = new Application();

app.configure(function(next, app) {
  return function(request) {
    if(!app.db) {
      app.db = new mongo.Server().db("blog");
    }
    var db = app.db;
    if(!db.posts) {
      db.posts = db.getCollection('posts');
      db.posts.ensureIndex({slug:1}, {sparse:true});
      db.posts.ensureIndex({created:1});
    }
    return next(request);
  }
}, "notfound", "render", "params", "route", "static");

app.render.base = "./lib/";
app.master = "blog-base.html";

var nonalnum = /[^0-9a-zA-Z]+/g;

function prettify(text) {
  return text.replace(nonalnum, '-').toLowerCase().replace(/^-*(.*?)-*$/, '$1');
}

function redirect(location) {
  return {
    status: 302,
    headers: { Location:location },
    body:[]
  };
}


app.renderParams = function(params) {
  return params;
}

app.get("/feed", function(request) {
  return app.render("blog-feed.xml", app.renderParams({
    posts: app.db.posts.find({}, {}).sort({created:-1}).limit(10).toArray().map(function(post) {
      post.html = markdown(post.body);
      post.created = new Date(post.created).toUTCString();
      return post;
    })
  }), {contentType:'application/rss+xml'});
});

app.get("/:slug", function(request, slug) {
  var post = app.db.posts.findOne({slug: slug});
  if(post) {
    post.html = markdown(post.body);
    return app.render("blog-post.html", app.renderParams({
      post: post,
      posts: app.db.posts.find({}, {title: 1, slug: 1}).sort({created:-1}).toArray().map(function(p) {
        if(post._id.toString() == p._id.toString()) {
          p.current = true;
        }
        return p;
      })
    }), {master: app.master});
  } else {
    throw {notfound:true};
  }
});

app.get("/:slug/edit", function(request, slug) {
  app.auth && app.auth(request);
  return app.render("blog-edit.html",
    app.renderParams(slug == 'new' ? {} : app.db.posts.findOne({slug: slug})),
    {master: app.master});
});

app.get("/", function(request) {
  var slug = app.db.posts.find({}, {slug: 1}).sort({created:-1}).limit(1).toArray()[0].slug;
  return redirect("./" + slug);
});

app.post("/", function(request) {
  app.auth && app.auth(request);
  if('delete' in request.params) {
    app.db.posts.remove({slug: request.params.slug});
  } else {
    var update = request.params;
    var oldSlug = update.slug;
    update.slug = oldSlug || prettify(update.title);
    update[oldSlug ? 'modified': 'created'] = new Date();
    app.db.posts.findAndModify({
      query: { slug: oldSlug },
      update: update,
      upsert: true
    });
  }
  return redirect("./");
});

