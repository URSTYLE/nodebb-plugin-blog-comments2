(function(module) {
	"use strict";

	var Comments = {};

	var db = module.parent.require('../src/database.js'),
		meta = module.parent.require('../src/meta.js'),
		posts = module.parent.require('../src/posts.js'),
		topics = module.parent.require('../src/topics.js'),
		user = module.parent.require('../src/user.js'),
		fs = require('fs'),
		path = require('path'),
		async = require('async');

	module.exports = Comments;

	Comments.getTopicIDByCommentID = function(commentID, callback) {
		db.getObjectField('blog-comments', commentID, function(err, tid) {
			callback(err, tid);
		});
	};

	Comments.getCommentData = function(req, res, callback) {
		var commentID = req.params.id,
			pagination = req.params.pagination ? req.params.pagination : 0,
			uid = req.user ? req.user.uid : 0;

		Comments.getTopicIDByCommentID(commentID, function(err, tid) {
			var disabled = false;

			async.parallel({
				posts: function(next) {
					if (disabled) {
						next(err, []);
					} else {
						topics.getTopicPosts(tid, 0 + req.params.pagination * 10, 9 + req.params.pagination * 9, uid, true, next);
					}
				},
				postCount: function(next) {
					topics.getTopicField(tid, 'postcount', next);
				},
				user: function(next) {
					user.getUserData(uid, next);
				},
				isAdmin: function(next) {
					user.isAdministrator(uid, next);
				}
			}, function(err, data) {
				res.header("Access-Control-Allow-Origin", meta.config['blog-comments:url']);
				res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept');
				res.header("Access-Control-Allow-Credentials", "true");

				res.json({
					posts: data.posts,
					postCount: data.postCount,
					user: data.user,
					template: Comments.template,
					token: res.locals.csrf_token,
					isAdmin: data.isAdmin,
					isLoggedIn: !!uid,
					tid: tid
				});
			});
		});
	};

	Comments.replyToComment = function(req, res, callback) {
		var content = req.body.content,
			tid = req.body.tid,
			url = req.body.url,
			uid = req.user ? req.user.uid : 0;

		topics.reply(tid, uid, content, function(err, postData) {
			if(err) {
				return res.redirect(url + '?error=' + err.message + '#nodebb/comments');
			}

			res.redirect(url + '#nodebb/comments');
		});
	};

	Comments.publishArticle = function(req, res, callback) {
		var markdown = req.body.markdown,
			title = req.body.title,
			url = req.body.url,
			commentID = req.body.id,
			uid = req.user ? req.user.uid : 0;

		var cid = meta.config['blog-comments:cid'] || 1;
		
		user.isAdministrator(uid, function (err, isAdmin) {
			if (!isAdmin) {
				res.json({error: "Only Administrators can publish articles"});
			}

			topics.post(uid, title, markdown, cid, function(err, result) {
				if(err) {
					res.json({error: err.message});
				}

				if (result && result.postData && result.postData.tid) {
					posts.setPostField(result.postData.pid, 'blog-comments:url', url);
					db.setObjectField('blog-comments', commentID, result.postData.tid);

					res.redirect((req.header('Referer') || '/') + '#nodebb/comments');	
				} else {
					res.json({error: "Unable to post topic", result: result});
				}
			});
		});
		
	};

	Comments.addLinkbackToArticle = function(post, callback) {
		posts.getPostField(post.pid, 'blog-comments:url', function(err, url) {
			if (url) {
				post.profile.push({
					content: "Posted from <strong><a href="+ url +" target='blank'>" + meta.config['blog-comments:name'] + "</a></strong>"
				});
			}

			callback(err, post);
		});		
	};

	Comments.addRoute = function(server, callback) {
		fs.readFile(path.resolve(__dirname, './public/templates/comments.tpl'), function (err, data) {
			Comments.template = data.toString();
		});

		server.routes = server.routes.concat(
			[
				{
					"route": "/comments/get/:id/:pagination?",
					"method": "get",
					"options": Comments.getCommentData
				},
				{
					"route": "/comments/reply",
					"method": "post",
					"options": Comments.replyToComment
				},
				{
					"route": "/comments/publish",
					"method": "post",
					"options": Comments.publishArticle
				}
			]
		);

		callback(null, server);
	};

	Comments.addAdminLink = function(custom_header, callback) {
		custom_header.plugins.push({
			"route": "/blog-comments",
			"icon": "fa-book",
			"name": "Blog Comments"
		});

		return custom_header;
	};

	Comments.addAdminRoute = function(custom_routes, callback) {
		fs.readFile(path.resolve(__dirname, './public/templates/admin.tpl'), function (err, template) {
			custom_routes.routes.push({
				"route": "/blog-comments",
				"method": "get",
				"options": function(req, res, callback) {
					callback({
						req: req,
						res: res,
						route: "/blog-comments",
						name: "Blog Comments",
						content: template
					});
				}
			});

			callback(null, custom_routes);
		});
	};

	Comments.addScripts = function(scripts, callback) {
		return scripts.concat([
				'plugins/nodebb-plugin-blog-comments/lib/main.js'
			]);
	};



}(module));