// ACS config
var ACS = require('acs-node');
var sdk;

var categories = [];
var rooms =[];
var users = [];
var matches = [];
var questions = [];
var questionsAnswered = [];
var currentMatches = [];
var currentQuestions = [];

function init() {
	initACS();
}

function initACS() {
	sdk = ACS.initACS('dqOaDoAlKXrBGNnRRehHewwcc7qmH44J');
	
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

function verifyWaitingUsers(roomId) {
	var usersLength = rooms[roomId].length;
	
	if (usersLength > 1) {
		var userA = rooms[roomId].shift();
		var userB = rooms[roomId].shift();
		
		userA.socket.emit('creatingMatch', {fighterId: userB.userId});
		userB.socket.emit('creatingMatch', {fighterId: userA.userId});
		
		startMatch(userA, userB, roomId);
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
				fields: {
					user_a: userA.userId,
					user_b: userB.userId,
					category: categoryId,
					question_1: questions[0],
					question_2: questions[1],
					question_3: questions[2],
					question_4: questions[3],
					question_5: questions[4],
					points_a: 0,
					points_b: 0
				}
			}, function (response){
				if (response.success) {
					var match = response.matches[0];
					var matchId = match.id;
					
					currentMatches[matchId] = [];
					currentMatches[matchId][0] = userA;
					currentMatches[matchId][1] = userB;
					
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

function removeUser(userId, roomId) {
	if (roomId) {
		var room = rooms[roomId];
		
		for (var i in room) {
			var row = room[i];
			
			if (row.userId == userId) {
				room.splice(i, 1);
				
				return;
			}
		}
	}
}

function updateMatchLog(matchLogId, userSide, questionIndex, time) {
	
	var fieldOption = 'question_' + questionIndex +  '_option_' + userSide;
	var fieldTime = 'question_' + questionIndex + '_time_' + userSide;
	
	var fields = {};
	fields[fieldOption] = questionIndex;
	fields[fieldTime] = time;
	
	ACS.Objects.update({
		classname: 'matches_log',
		id: matchLogId,
		fields: fields
	});
}

function questionAnsweredReady(matchId, questionIndex, socket) {
	
	if (!questionsAnswered[matchId]) {
		questionsAnswered[matchId] = [];
	}
	
	if (!questionsAnswered[matchId][questionIndex]) {
		questionsAnswered[matchId][questionIndex] = [];
	}
	
	questionsAnswered[matchId][questionIndex].push(socket);
	
	if (questionsAnswered[matchId][questionIndex].length == 2) {
		
		emitNextQuestion(matchId, questionIndex, questionsAnswered);
				
		var index = questionsAnswered[matchId].indexOf(questionIndex);
		questionsAnswered[matchId].splice(index, 1);
		
		index = questionsAnswered.indexOf(matchId);
		questionsAnswered.splice(index, 1);
	}
}

function emitNextQuestion(matchId, questionIndex, container) {
	if (questionIndex == 5) {
			container[matchId][questionIndex][0].emit('finishGame', {});
			container[matchId][questionIndex][1].emit('finishGame', {});
		} else {
			container[matchId][questionIndex][0].emit('showQuestion', {questionIndex: questionIndex + 1});
			container[matchId][questionIndex][1].emit('showQuestion', {questionIndex: questionIndex + 1});	
		}
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

// #leaveRoom
function leaveRoom(data, socket) {
	var userId = data.userId;
	var roomId = data.roomId;
	
	removeUser(userId, roomId);
}

// #userReady
function userReady(data, socket) {
	var matchId = data.matchId;
	
	if (!matches[matchId]) {
		matches[matchId] = [];
	}
	
	matches[matchId].push(socket);
	
	if (matches[matchId].length == 2) {
		matches[matchId][0].emit('showQuestion', {questionIndex: 1});
		matches[matchId][1].emit('showQuestion', {questionIndex: 1});
		
		var index = matches.indexOf(matchId);
		matches.splice(index, 1);
	}
}

function questionReady(data, socket) {
	var questionIndex = data.questionIndex;
	var matchId = data.matchId;
	
	if (!questions[matchId]) {
		questions[matchId] = [];
	}
	
	if (!questions[matchId][questionIndex]) {
		questions[matchId][questionIndex] = [];
	}
	
	questions[matchId][questionIndex].push(socket);
	
	if (questions[matchId][questionIndex].length == 2) {
		questions[matchId][questionIndex][0].emit('startQuestion', {questionIndex: questionIndex});
		questions[matchId][questionIndex][1].emit('startQuestion', {questionIndex: questionIndex});
		
		var index = questions[matchId].indexOf(questionIndex);
		questions[matchId].splice(index, 1);
		
		index = questions.indexOf(matchId);
		questions.splice(index, 1);
	}
}

// #questionAnswered
function questionAnswered(data, socket) {
	var userSide = data.userSide;
	var matchId = data.matchId;
	var questionIndex = data.questionIndex;
	var time = data.time;
	var isCorrect = data.isCorrect;
	var option = data.option;
	
	ACS.Objects.query({
		classname: 'matches_log',
		where: {
			match_id: matchId
		}
	}, function(response) {
		if (response.success) {
			if (response.matches_log.length == 0) {
				ACS.Objects.create({
					classname: 'matches_log',
					fields: {
						match_id: matchId,
						question_1_option_a: 0,
						question_1_time_a: 0,
						question_2_option_a: 0,
						question_2_time_a: 0,
						question_3_option_a: 0,
						question_3_time_a: 0,
						question_4_option_a: 0,
						question_4_time_a: 0,
						question_5_option_a: 0,
						question_5_time_a: 0,
						question_1_option_b: 0,
						question_1_time_b: 0,
						question_2_option_b: 0,
						question_2_time_b: 0,
						question_3_option_b: 0,
						question_3_time_b: 0,
						question_4_option_b: 0,
						question_4_time_b: 0,
						question_5_option_b: 0,
						question_5_time_b: 0
					}
				}, function(response) {
					if (response.success) {
						var matchLogId = response.matches_log[0].id;
						updateMatchLog(matchLogId, userSide, questionIndex, time);
					}
				});				
			} else {
				var matchLogId = response.matches_log[0].id;
				updateMatchLog(matchLogId, userSide, questionIndex, time);
			}
		}
	});
	
	var fighterSideIndex = userSide == 'a' ? 1 : 0;
	currentMatches[matchId][fighterSideIndex].socket.emit('fighterAnswered', {time: time, isCorrect: isCorrect, option: option});
	
	questionAnsweredReady(matchId, questionIndex, socket);
}

// #timerEnd
function timerEnd(data, socket) {
	var matchId = data.matchId;
	var questionIndex = data.questionIndex;
	
	if (!currentQuestions[matchId]) {
		currentQuestions[matchId] = [];
	}
	
	if (!currentQuestions[matchId][questionIndex]) {
		currentQuestions[matchId][questionIndex] = [];
	}
	
	currentQuestions[matchId][questionIndex].push(socket);
	
	// recebi timerEnd dos dois
	if (currentQuestions[matchId][questionIndex].length == 2) {
		emitNextQuestion(matchId, questionIndex, currentQuestions);
		
		var index = currentQuestions[matchId].indexOf(questionIndex);
		currentQuestions[matchId].splice(index, 1);
		
		index = currentQuestions.indexOf(matchId);
		currentQuestions.splice(index, 1);
		
	}
}

// #matchResult
function matchResult(data, socket) {
	var matchId = data.matchId;
	var pointsA = data.pointsA;
	var pointsB = data.pointsB;
	var userPoints;
	var userWinner;
	
	ACS.Objects.update({
		classname: 'matches',
		id: matchId,
		fields: {
			points_a: pointsA,
			points_b: pointsB
		}
	});
	
	// se não houver ganhador, ninguém ganha achievements
	if (pointsA != pointsB) {
		userPoints = pointsA > pointsB ? pointsA : pointsB;
		
		ACS.Objects.query({
			classname: 'matches',
			where: {
				id: matchId
			}
		}, function(response){
			if (response.success) {
				var match = response.matches[0];
				var userId = pointsA > pointsB ? match.user_a : match.user_b;
				var categoryId = match.category;
				
				ACS.Objects.query({
					classname: 'achievements',
					where: {
						users_id: userId,
						categories_id: categoryId
					}
				}, function(response) {
					if (response.success && response.achievements.length > 0) {
						var achievementId = response.achievements[0].id;
						userPoints = response.achievements[0].points + userPoints;
						
						ACS.Objects.update({
							classname: 'achievements',
							id: achievementId,
							fields: {
								points: userPoints
							}
						});
					} else {						
						ACS.Objects.create({
							classname: 'achievements',
							fields: {
								users_id: userId,
								points: userPoints,
								categories_id: categoryId
							}
						});
					}
				});
			}
		});	
	}
}

// init app

init();