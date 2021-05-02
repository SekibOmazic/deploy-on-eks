import express, { Application } from 'express'

const app: Application = express()
const PORT = 80

app.use(express.json())

const BLUE = 'cornflowerblue'
const GREEN = 'green'
const RED = 'red'

// start with the blue background
const color = BLUE

const page = `
<head>
  <title>EKS deployment</title>
</head>

<body style="display: flex; align-items: center; justify-content: center; background-color: ${color};">
  <h1 style="color: white;">
    Hello from AWS EKS
  </h1>
</body>
`

app.get('/', (_req, res) => {
  res.setHeader('Content-type', 'text/html')
  return res.send(page)
})

app.use('/color', (_req, res) =>
  res.json({
    color: color,
  })
)
app.get('/health', (_req, res) => res.send('Healthy!'))
app.all('*', (_req, res) => res.send('Ooops, no such route'))

app.listen(PORT, () =>
  console.log(`Server running on port: http://localhost:${PORT}`)
)
