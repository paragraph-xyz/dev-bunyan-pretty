'use strict'

const fp = require('lodash/fp')
const Constants = require('../constants')
const Utils = require('../utils')
const chalk = require('../utils/chalk')
const Stack = require('../utils/Stack')

function render(record, raw = false) {
  if (raw === false) {
    if (!Utils.isError(record)) return []
  }

  const bold = chalk.red.bold
  const normal = chalk.reset
  const dimmed = chalk.dim

  const err = raw ? fp.cloneDeep(record) : fp.cloneDeep(record.err)

  const output = []

  if (err.name !== null && err.name !== undefined) {
    output.push(bold(Constants.ARROW + Constants.SPACE_CHAR + err.name))
  }

  if (err.message !== null && err.message !== undefined) {
    output.push(padRed('message') + normal(err.message))
  }

  if (err.code !== null && err.code !== undefined) {
    output.push(padRed('code') + normal(err.code))
  }

  if (err.signal !== null && err.signal !== undefined) {
    output.push(padRed('signal') + normal(err.signal))
  }

  // Add all custom fields from the error object
  const knownFields = ['name', 'message', 'code', 'signal', 'stack']
  Object.keys(err).forEach((key) => {
    if (
      !knownFields.includes(key) &&
      err[key] !== null &&
      err[key] !== undefined
    ) {
      let value = err[key]

      // Skip or format problematic values
      if (Array.isArray(value) && value.length > 50) {
        // Very large arrays are likely binary data or noise
        value = `[Array with ${value.length} items]`
      } else if (typeof value === 'object') {
        // Check if object has circular references or is too large
        try {
          const stringified = JSON.stringify(
            value,
            (key, val) => {
              // Filter out large arrays within objects (like binary data)
              if (Array.isArray(val) && val.length > 50) {
                return `[Array with ${val.length} items]`
              }
              // Filter out circular references
              if (
                typeof val === 'object' &&
                val !== null &&
                val.constructor &&
                val.constructor.name === 'IncomingMessage'
              ) {
                return '[HTTP IncomingMessage]'
              }
              if (
                typeof val === 'object' &&
                val !== null &&
                val.constructor &&
                val.constructor.name === 'ClientRequest'
              ) {
                return '[HTTP ClientRequest]'
              }
              if (val === '[Circular]') {
                return '[Circular Reference]'
              }
              return val
            },
            2
          )

          if (stringified.length > 2000) {
            value = `[Object - ${
              Object.keys(value).length
            } keys] (too large to display)`
          } else {
            value = stringified
          }
        } catch (e) {
          value = `[Object - circular or non-serializable]`
        }
      } else {
        value = String(value)
      }

      output.push(padRed(key) + normal(value))
    }
  })

  if (err.stack) {
    const stacks = err.stack.split('Caused by: ')
    const stack = Stack(stacks.shift())

    if (stack.length > 0) {
      output.push(padRed('stack') + chalk.dim(`[${stack.length} Frames]`))
      // Always show full stack trace instead of filtering to Application frames only
      addFrames(stack)
    }

    stacks.forEach((cause) => {
      const reason = getReason(cause)
      const stackFrames = Stack(cause)

      if (stackFrames.length > 0) {
        output.push(
          padRed('Caused by') +
            chalk.red(reason) +
            chalk.dim(` [${stackFrames.length} Frames]`)
        )

        // Always show full stack trace for caused-by sections too
        addFrames(stackFrames)
      }
    })
  }

  return output.map((v) => Constants.PADDING + v)

  function addFrames(stack) {
    const formatStack = prettyStack(stack)

    formatStack.forEach(function (frame) {
      output.push(
        Constants.PADDING +
          dimmed(Constants.SPACE_CHAR + Constants.DOT + Constants.SPACE_CHAR) +
          frame
      )
    })
  }
}

module.exports = render

function padRed(head) {
  return chalk.red(Constants.PADDING + head + ':' + Constants.SPACE_CHAR)
}

function getReason(cause) {
  const first = cause.split('\n').shift().split(';').shift()

  return first.replace('Caused by: ', '') || ''
}

function prettyStack(stack) {
  const frames = stack || []
  const lines = []
  frames.forEach(function (frame) {
    let color = 'dim'
    switch (frame.kind) {
      case 'Library':
        color = 'reset'
        break
      case 'Application':
        color = 'yellow'
        break
    }

    let formatframe = Utils.format(
      '%s:%s - %s',
      frame.path,
      frame.line,
      frame.fn
    )

    if (frame.kind === 'Application') {
      const filepath = Utils.shortPath(frame.path)
      formatframe = Utils.format('%s:%s - %s', filepath, frame.line, frame.fn)
    }

    if (frame.kind === 'Library') {
      const filepath = Utils.modulePath(frame.path)
      formatframe = Utils.format('%s:%s - %s', filepath, frame.line, frame.fn)
    }

    lines.push(chalk[color](formatframe))
  })

  return lines
}
