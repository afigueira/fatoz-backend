// ACS config
var ACS = require('acs-node');
var sdk;

var categories = [];
var rooms =[];
var users = [];
var matches = [];

function init() {
	initACS();
}

function initACS() {
	sdk = ACS.initACS('dqOaDoAlKXrBGNnRRehHewwcc7qmH44J');
	
	// TO-DO create an administrator user
	ACS.Users.login({
		login: 'administrator',
		password: '1123581321'
	}, function (response) {
		getAllCategories();
	});
}

function getAllCategories() {
	ACS.Objects.query({
		classname: 'categories',
		per_page: 100
	}, function (response){
		if (response.success) {
			categories = response.categories;
			
			for (var i in categories) {
				var category = categories[i];
				
				rooms[category.id] = [];
			}
		}
	});
}

// public methods

// #enterUser
function enterUser(data, socket) {
	console.log('enterUser!');
}

// #exitUser
function exitUser(data, socket) {
	console.log('exitUser!');
}

// #joinRoom
function joinRoom(data, socket) {
	var roomId = data.roomId;
	var userId = data.userId;
	
	var row = {userId: userId, socket: socket};
	
	rooms[roomId].push(row);
	
	verifyWaitingUsers(roomId);
}

function verifyWaitingUsers(roomId) {
	var usersLength = rooms[roomId].length;
	
	if (usersLength > 1) {
		console.log('more than 1 user waiting');
		var userA = rooms[roomId].shift();
		var userB = rooms[roomId].shift();
		
		userA.socket.emit('creatingMatch', {fighterId: userB.userId});
		userB.socket.emit('creatingMatch', {fighterId: userA.userId});
		
		startMatch(userA, userB, roomId);
	} else {
		console.log('waiting other users...');
	}
}

function startMatch(userA, userB, categoryId) {	
	// pegar questões só da categoria
	sdk.rest('objects/categories_has_questions/query.json', 'GET', {
		per_page: 1,
		where: {
			categories_id: categoryId
		}
	}, function (response) {
		var total = response.meta.count;
		
		var onCompleteCreateQuestions = function(questions) {
			ACS.Objects.create({
				classname: 'matches',
				// TO-DO set userId
				fields: {
					user_a: userA.userId,
					user_b: userB.userId,
					category: categoryId,
					question_1: questions[0],
					question_2: questions[1],
					question_3: questions[2],
					question_4: questions[3],
					question_5: questions[4]
				}
			}, function (response){
				if (response.success) {
					var match = response.matches[0];
					var matchId = match.id;
					
					userA.socket.emit('mountMatch', {categoryId: categoryId, matchId: matchId});
					userB.socket.emit('mountMatch', {categoryId: categoryId, matchId: matchId});
				}
			});
		};
		
		// default 0 because ACS doesn't allow empty array
		var selectedQuestions = [0];
		
		getQuestion(total, selectedQuestions, categoryId, onCompleteCreateQuestions);
	});
}

function getQuestion(total, arrayIgnore, categoryId, callback) {
	ACS.Objects.query({
		classname: 'categories_has_questions',
		page: Math.ceil(Math.random() * (total - (arrayIgnore.lenght-1))),
		per_page: 1,
		where: {
			"questions_id": {"$nin": arrayIgnore}
		}
	}, function(response) {
		if (response.success) {
			var question = response.categories_has_questions[0];
			
			arrayIgnore.push(question.questions_id);
			
			if (arrayIgnore.length > 5) {
				arrayIgnore.shift();
				callback(arrayIgnore);
			} else {
				getQuestion(total, arrayIgnore, categoryId, callback);
			}
		}
	});	
}

// #leaveRoom
function leaveRoom(data, socket) {
	console.log('leaveRoom!');
}

// #userReady
function userReady(data, socket) {
	var matchId = data.matchId;
	
	if (!matches[matchId]) {
		matches[matchId] = [];
	}
	
	matches[matchId].push(socket);
	
	if (matches[matchId].length == 2) {
		matches[matchId][0].emit('showQuestion', {questionId: 1});
		matches[matchId][1].emit('showQuestion', {questionId: 1});
		
		var index = matches.indexOf(matchId);
		matches.splice(index, 1);
	}
}

// #questionAnswered
function questionAnswered(data, socket) {
	console.log('questionAnswered!');
}

// init app

init();