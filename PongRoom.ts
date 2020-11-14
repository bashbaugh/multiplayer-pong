import { Room, Client } from "colyseus"
import { Schema, type } from "@colyseus/schema"

class Player extends Schema {
  // This class keeps track of the racket position, score and name for a player
  @type('number')
  racketX: number = 250 // Initializing it at 270 will make sure it's centered

  @type('int8')
  score: number = 0

  @type('boolean')
  hasWon: boolean = false

  @type('string')
  name: string

  @type('string')
  clientId: string // We'll use this to keep track of which player is which
}

class PongState extends Schema {
  // Has the game started?
  @type('boolean')
  gameStarted: boolean = false

  @type('number')
  roundStartedAt: number

  // We instantiate two player classes, one for each player
  @type(Player)
  player1: Player = new Player() 
  @type(Player)
  player2: Player = new Player()

  // We also define a few variables to keep track of the Pong.
  @type('number')
  pongX: number = 300 // Initializing it at 300 will make sure it's centered
  @type('number')
  pongY: number = 300
  @type('boolean')
  pongDirection: boolean // true/1 means it's flying towards player 2, false/0 means it's flying toward player 1
  @type('float32')
  pongAngle: number = 0 // 0 means it's flying in a straight line, 1 is 45 degrees right, -1 is 45 degrees left
}

export default class PongRoom extends Room {
  roundIsRunning: boolean

  onCreate (options: any) {
    this.setState(new PongState()) // Set the state for the room
    this.setSimulationInterval(delta => this.update(delta)) // Set a "simulation interval" aka an update function (similar to the loop function in game.js)
    this.setPatchRate(20) // The patch rate determines the interval (in milliseconds) at which the server sends state updates to the client
    this.maxClients = 2 // Only 2 players per Pong game
    this.clock.start() // Start the game clock

    this.onMessage('moveRacket', (client, data) => {
      // First, we check the client's id to see whether they're player 1 or player 2
      const player = (client.sessionId === this.state.player1.clientId) ? this.state.player1 : this.state.player2

      player.racketX += data.move // Adjust the player's pong position. data is passed from the player; we'll code that soon.

      player.racketX = Math.min(Math.max(player.racketX, 0), 500) // We clamp the paddle position so the player can't move it off the canvas
    })
  }

  update (delta: number) {
    if (!this.state.gameStarted || !this.roundIsRunning) return // Don't update if the game or round hasn't started

    const timeMsSinceRoundStart = this.clock.elapsedTime - this.state.roundStartedAt
    const speedConstant = (delta / 3) * (timeMsSinceRoundStart / 30000 + 1) // Calculate the speed constant for the ball. it should gradually increase over time.

    // Update the ball's position:
    if (this.state.pongDirection === true) this.state.pongY += speedConstant // Ball is moving TOWARD player 2
    else this.state.pongY -= speedConstant // ball is moving away from player 2

    this.state.pongX += (speedConstant * this.state.pongAngle) // Change the x value depending on the angle

    if (this.state.pongY + 10 >= 580 || this.state.pongY - 10 <= 20) // If ball is touching goal zone (+- 10 to account for radius)...
    {
      const isOnPlayer1Side = this.state.pongY - 10 <= 20 // Is it on player 1's side or player 2's?

      const racketX = isOnPlayer1Side ? this.state.player1.racketX : this.state.player2.racketX

      if (this.state.pongX >= racketX && this.state.pongX <= racketX + 100 ) { // Ball collided with racket!!!
        this.state.pongDirection = !this.state.pongDirection // Flip the direction
        this.state.pongAngle = (this.state.pongX - (racketX + 50)) / 40 // Calculate the new angle between -1 and 1
        this.state.pongY = isOnPlayer1Side ? 30 : 570 // Move the ball to the edge of the racket to make sure it doesn't get stuck
      } else { // Ball did not collide with racket - SCORE!!!
        isOnPlayer1Side ? this.state.player2.score += 1 : this.state.player1.score +=1 // Increment the other player's score
        
        this.roundIsRunning = false
        this.clock.setTimeout(() => this.startGame(), 1000) // Wait 1 second before starting next round
      }
    } else if (this.state.pongX > 590 || this.state.pongX < 10) { // Ball is touching edge of canvas!
      this.state.pongAngle *= -1 // Flip the angle so the ball bounces back
    }

    if (this.state.player1.score >= 10 || this.state.player2.score >= 10) { // One of the players has won
      const playerThatWon = this.state.player1.score >= 10 ? this.state.player1 : this.state.player2

      playerThatWon.hasWon = true

      this.broadcastPatch() // Broadcast the new state to make sure each player knows who won before we disconnect them

      this.disconnect() // Disconnect players from room and dispose
    }
  }

  startGame() {
    this.state.pongDirection = Math.random() <= 0.5 // Randomize the starting direction of the pong
    // Reset the position and angle
    this.state.pongX = 300
    this.state.pongY = 300 
    this.state.pongAngle = 0
    this.state.roundStartedAt = this.clock.elapsedTime // Set the round started time using the timestamp from the game clock
    this.roundIsRunning = true
    this.state.gameStarted = true // Start the game!!!
  }

  onJoin (client: Client, options: any) {
    // Determine whether this is player 2 or player 1 joining. If player 1 already exists then this is player 2.
    const alreadyHasPlayer1 = !!this.state.player1.clientId
    const newPlayerState = alreadyHasPlayer1 ? this.state.player2 : this.state.player1

    // Set the player's name and ID:

    newPlayerState.name = options.name // options contain options passed from the player. We'll write that part soon.

    newPlayerState.clientId = client.sessionId

    if (alreadyHasPlayer1) {
      // We now have 2 players and can start the game!!!
      this.clock.setTimeout(() => this.startGame(), 2000) // Wait 2 seconds before starting
    } else {
      client.send('youArePlayer1')
    }
  }

  onLeave (client: Client, consented: boolean) {
    this.disconnect() // If a player leaves the game is unplayable, so destroy the room
  }
}
