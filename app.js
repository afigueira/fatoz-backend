// initialize app
function start(app, express, io) {
	app.use(express.favicon(__dirname + '/public/images/favicon.ico'));		//set favicon
	
	app.io = io;
}

// release resources
function stop() {
	
}