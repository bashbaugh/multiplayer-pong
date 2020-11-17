import { Room, Client } from "colyseus"
import { Schema, type } from "@colyseus/schema"

class Player extends Schema {
  // This class keeps track of the racket position, score and name for a player
  @type('number')
  racketX: number = 250 // Initializing it at 250 will make sure it's centered

  @type('int8')
  score: number = 0

  @type('boolean')
  hasWon: boolean = false // Has the player won?

  @type('string')
  name: string // The player's user name

  @type('string')
  clientId: string // We'll use this to keep track of which player is which
}

class PongState extends Schema {
  @type('number')
  roundStartedAt: number

  @type('boolean')
  gameStarted: boolean = false // Has the game started?

  // We instantiate two player schema classes, one for each player
  @type(Player)
  player1: Player = new Player() 
  @type(Player)
  player2: Player = new Player()

  // We also define a few variables to keep track of the Pong
  @type('number')
  pongX: number
  @type('number')
  pongY: number
  @type('boolean')
  pongDirection: boolean // 1 means it's flying towards player 2, 0 means it's flying toward player 1
  @type('float32')
  pongAngle: number // 0 means it's flying in a straight line, 1 is 45 degrees right, -1 is 45 degrees left
}

export default class PongRoom extends Room {
  roundIsRunning: boolean

  onCreate (options: any) {
    this.setState(new PongState()) // Set the state for the room, this is a class we will write in the next step
    this.setSimulationInterval(delta => this.update(delta)) // Set a "simulation interval" aka an update function (similar to the loop function in game.js) that's called about 60 times per second. We'll use this later.
    this.setPatchRate(25) // The patch rate determines the interval (in milliseconds) at which the server sends state updates to the client.
    this.maxClients = 2 // Only 2 players per Pong game!
    this.clock.start() // Start the game clock, a colyseus feature we'll use later

    this.onMessage('moveRacket', (client, data) => {
      // First, we check the client's id to see whether they're player 1 or player 2
      const player = (client.sessionId === this.state.player1.clientId) ? this.state.player1 : this.state.player2

      player.racketX += data.move // Adjust the player's pong position with the data passed from the player (game.js)

      player.racketX = Math.min(Math.max(player.racketX, 0), 500) // We clamp the paddle position so the player can't move it off the canvas
    })
  }

  // These are some empty methods we'll write later:

  update (delta: number) {
    if (!this.state.gameStarted || !this.roundIsRunning) return // Don't update if the game or round hasn't started

    const timeMsSinceRoundStart = this.clock.elapsedTime - this.state.roundStartedAt
    const speedConstant = (delta / 3) * (timeMsSinceRoundStart / 30000 + 1) // Calculate the speed constant for the ball. It should gradually increase over time.

    // Update the ball's Y position:
    if (this.state.pongDirection) this.state.pongY += speedConstant // Ball is moving TOWARD player 2, so we increase its y position
    else this.state.pongY -= speedConstant // else, ball is moving away from player 2, so we decrease its Y position

    // Update the ball's X position:
    this.state.pongX += (speedConstant * this.state.pongAngle) // Change the x value depending on the angle.

    if (this.state.pongY + 10 >= 580 || this.state.pongY - 10 <= 20) // If ball is touching goal zone on either side (+- 10 to account for radius)...
    {
      const isOnPlayer1Side = this.state.pongY - 10 <= 20 // Is it on player 1's side or player 2's?

      const racketX = isOnPlayer1Side ? this.state.player1.racketX : this.state.player2.racketX // Get the racket position, depending on whos side it's on

      if (this.state.pongX >= racketX && this.state.pongX <= racketX + 100 ) { // If the ball's x position matches the racket, that means it collided!
        // Bounce the ball off the racket:
        this.state.pongDirection = !this.state.pongDirection // Flip the direction the ball is moving
        this.state.pongAngle = (this.state.pongX - (racketX + 50)) / 50 // Calculate the new angle for the racket, based on where the ball collided
        this.state.pongY = isOnPlayer1Side ? 30 : 570 // Move the ball's Y position to the edge of the racket to make sure it doesn't get stuck in the racket
      } else { // Ball did not collide with racket - SCORE!!!
        if (isOnPlayer1Side) this.state.player2.score += 1 // If the ball's on played 1's side, player 2 scored
        else this.state.player1.score +=1 // else, player 1 scored
        
        this.roundIsRunning = false
        this.clock.setTimeout(() => this.startGame(), 1000) // Wait 1 second before starting next round
      }
    } else if (this.state.pongX >= 590 || this.state.pongX <= 10) { // If the ball is touching the left or right edge of the canvas...
      this.state.pongAngle *= -1 // Flip the angle so the ball bounces back
    }

    if (this.state.player1.score >= 10 || this.state.player2.score >= 10) { // If one of the players has a winning score of 10...
      if (this.state.player1.score >= 10) this.state.player1.hasWon = true // Player 1 won
      else this.state.player2.hasWon = true // else player 2 won

      // These are both Colyseus room methods:
      this.broadcastPatch() // Broadcast the new state update to make sure each player knows who won before we disconnect them

      this.disconnect() // Disconnect players from room and dispose of the room (it's no longer needed as the game is over)
    }
  }

  startGame() {
    this.state.pongDirection = Math.random() <= 0.5 // Randomize the starting direction of the pong
    // Reset the position and angle of pong
    this.state.pongX = 300
    this.state.pongY = 300 
    this.state.pongAngle = 0
    this.roundIsRunning = true
    this.state.roundStartedAt = this.clock.elapsedTime // Set the round started time using the timestamp from the colyseus clock
    this.state.gameStarted = true // Start the game!!!
  }

  onJoin (client: Client, options: any) {
    // Determine whether this is player 2 or player 1 joining. If player 1 already exists then this is player 2.
    const alreadyHasPlayer1 = !!this.state.player1.clientId // If the player1 clientId is already there, this must be player 2
    const newPlayerState = alreadyHasPlayer1 ? this.state.player2 : this.state.player1

    // Set the player's name and ID:

    newPlayerState.name = options.name // options contain options passed from the player. Remember when we wrote the .joinOrCreate part of game.js? We passed the user's name to the server so that we could use it here!

    newPlayerState.clientId = client.sessionId // We can also get the new player's session ID (assigned by Colyseus) and set it. We can then use this to identify them.

    if (alreadyHasPlayer1) {
      // We now have 2 players and can start the game!!!
      this.clock.setTimeout(() => this.startGame(), 2000) // Wait 2 seconds before starting
    } else {
      client.send('youArePlayer1') // This is player 1, make sure to let them know!
    }
  }

  onLeave (client: Client, consented: boolean) {
    this.disconnect() // If a player leaves the game is unplayable, so destroy the room and disconnect the remaining player so that they can find a new game.
  }
}