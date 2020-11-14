const userName = prompt("Choose a name:") || 'player'
// const userName = null

const gameStatusText = document.getElementById('game-status-text')
const canvas = document.getElementById('game-canvas')
const width = canvas.width, height = canvas.height
const ctx = canvas.getContext('2d') // This is the canvas context, which we can use to draw things on the canvas.

let leftIsPressed, rightIsPressed

// Connect to the colyseus server on port 3000:
const client = new Colyseus.Client(`ws://${window.location.hostname}${window.location.hostname.startsWith('local') ? ':3000' : ''}`)

let room // We'll store the room in this variable
let isPlayer1 = false
client.joinOrCreate('pong', { name: userName || 'player'})
.then(r => { // We successfully found or created a pong game
  console.log("joined successfully", r)
  room = r
  room.onMessage('youArePlayer1', m => { isPlayer1 = true }) // If the server tells us we're player 1, set isPlayer1 to true

  room.state.listen('gameStarted', (currentValue, oldValue) => {
    // If the game has started and it wasn't started previously, update the status text
    if (currentValue && !oldValue) gameStatusText.innerText = `${room.state.player1.name} vs ${room.state.player2.name}`
  })

  room.onLeave((code) => {
    gameStatusText.innerText = 'Game Over. ' // We were disconnected from the game (either intentionally or because of an error), let the player know it's game over.
    // Let the user know if either player won:
    if (room.state.player1.hasWon) gameStatusText.innerText +=  ` ${room.state.player1.name} won!!!`
    else if (room.state.player2.hasWon) gameStatusText.innerText += ` ${room.state.player2.name} won!!!`
    else gameStatusText.innerText += ' A player disconnected.' // if neither player won, that means one of the players disconnected before the game was finished.
    gameStatusText.innerText += ' Reload the page to find a new game.' // Tell the player how they can find a new game.
  })
}).catch(e => { // Something went wrong
  console.error("couldn't join room", e)
})

function draw () {
  // Draw the rackets
  ctx.fillStyle = 'white' // set the color
  // Draw the bottom racket with a width of 100 and height of 20 (bottom racket is always this player's racket)
  ctx.fillRect(isPlayer1 ? room.state.player1.racketX : room.state.player2.racketX, height - 20, 100, 20)
  // Draw opponent's top racket
  ctx.fillRect(isPlayer1 ? room.state.player2.racketX : room.state.player1.racketX, 0, 100, 20)

  // Draw the pong ball
  ctx.beginPath() // Start a new drawing path
  const pongY = isPlayer1 ? 600 - room.state.pongY : room.state.pongY // For player 1 we should flip the direction of the ball
  ctx.arc(room.state.pongX, pongY, 10, 0, 2 * Math.PI) // Draw the ball with a radius of 20
  ctx.fill() // fill it in

  // Draw the score
  ctx.font = '30px Arial'
  ctx.fillText(isPlayer1 ? room.state.player1.score : room.state.player2.score, 15,  height - 45) // The bottom player's score
  ctx.fillText(isPlayer1 ? room.state.player2.score : room.state.player1.score, 15, 45) // The top player's score
}

let lastRender = 0 // Initialize lastRender variable to keep track of when the loop was last run.
function loop(timestamp) {
  var delta = timestamp - lastRender // How many milliseconds have past since the loop last ran?

  // Erase the canvas and refill with black every time the loop runs
  ctx.fillStyle = 'black'
  ctx.clearRect(0, 0, width, height)
  ctx.fillRect(0, 0, width, height)

  if (leftIsPressed) {
    room.send('moveRacket', { move: -(delta / 2) }) // Negative sign so the racket moves left
  }
  if (rightIsPressed) room.send('moveRacket', { move: (delta / 2) })


  if (room && room.state.gameStarted) { // Don't draw anything until the game has started
    draw() // Draw everything
  }

  lastRender = timestamp // Update the last render variable
  window.requestAnimationFrame(loop) // Schedule this function to be run again.
}

window.requestAnimationFrame(loop) // Schedule the loop function to be run next frame

window.onkeydown = function (e) {
  if (e.key === 'ArrowLeft') leftIsPressed = true
  if (e.key === 'ArrowRight') rightIsPressed = true
}

window.onkeyup = function (e) {
  if (e.key === 'ArrowLeft') leftIsPressed = false
  if (e.key === 'ArrowRight') rightIsPressed = false
}