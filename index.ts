import http from "http"
import path from "path"
import express from "express"
import { Server } from "colyseus"
import { monitor } from "@colyseus/monitor"
import PongRoom from "./PongRoom"

const port = 3000 // We need to choose a port for our game to run on, but it doesn't really matter as REPL will automatically detect it.
const app = express() // This line creates a new Express app for the server

app.use(express.json()) // This line tells express to interpret incoming requests as JSON, which makes it easy for Colyseus to understand and interact with the requests.

// (you can just ignore this next block) On REPL, Colyseus doesn't work over HTTPS without additional configuration. For building this pong workshop this workaround is necesarry to make it work on Repl, but make sure to remove this if you expand your game into a full website with many people playing it, as this effectively disables encryption to prevent mixed content errors. For some reason, converting everything to HTTPS instead wasn't working, even though it should.
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http') {
    next()
  } else {
    return res.redirect(302, 'http://' + req.headers.host + req.url) 
  }
})

const server = http.createServer(app) // here, we initialize a HTTP server using our express app.
const gameServer = new Server({ server }) // This line adds Colyseus, the game framework, to our Express server!

gameServer.define('pong', PongRoom) // Add the pong room to the server

app.use('/colyseus', monitor()) // This sets up a route allowing us to view all the Colyseus state data in real-time from a browser. I'll explain it later.

app.get('/', (req: express.Request, res: express.Response) => {
  res.sendFile(path.resolve('game.html')) // Respond with the game file when the user visits the server. Path.resolve makes sure the path is absolute so Express can find the file.
})

app.get('/game.js', (req: express.Request, res: express.Response) => {
  res.sendFile(path.resolve('game.js')) // Send game.js as well.
})

gameServer.listen(port) // Finally, we start the server by listening to incoming HTTP requests from players' browsers.
console.log(`Listening on http://localhost:${ port }`)