var express = require('express')
var cors = require('cors')
var app = express()
const port = 3000
const message = {
    text: "hola joel"
}

app.use(cors())
app.get('/', (req, res) => {
  res.send(message)
})
















app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
