const keyFrom = event => `${event.altKey ? 'alt-': ''}${event.key && event.key.toLowerCase()}`

const Mode = {
  NORMAL: 'NORMAL',
  INSERT: 'INSERT'
}

const stateFactory = (stateChanged = () => {}) => {
  let s = {
    mode: Mode.NORMAL,
    anchorOffset: 0,
    debug: false
  }

  return {
    set: stateReducer => {
      s = Object.assign({}, s, stateReducer(s))
      stateChanged()
    },
    get: () => Object.assign({}, s)
  }
}

const state = stateFactory(() => document.getElementById('pageContainer').dispatchEvent(new Event('vimflowy.stateChanged')))

const debug = (...args) => state.get().debug && console.log(...args)

const moveCursorHorizontally = offset => {
  const {anchorOffset, baseNode} = document.getSelection()
  const targetCursorPosition = anchorOffset + offset
  if (targetCursorPosition < 0) {
    return
  }

  if (targetCursorPosition > baseNode.length) {
    return
  }

  const selection = window.getSelection()
  state.set(s => ({
    anchorOffset: targetCursorPosition
  }))

  const range = document.createRange()
  range.setStart(baseNode, targetCursorPosition)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  baseNode.parentElement.focus()
}

const projectAncestor = project => {
  const ancestor = project.closest(`.project:not([projectid='${project.getAttribute('projectid')}'])`)

  return ancestor.className.includes('mainTreeRoot')
    ? project
    : ancestor
} 

const moveAboveFold = element => {
  const rect = element.getBoundingClientRect()
  const fold = window.innerHeight
  const scrollPosition = window.scrollY
  const beyondFold = rect.top >= fold || (rect.top < fold && rect.bottom > fold)
  const floatingHeaderHeight = 30
  const aboveViewport = rect.top < floatingHeaderHeight

  if (!beyondFold && !aboveViewport) {
    return
  }

  element.scrollIntoView()
  if (aboveViewport) {
    window.scrollBy(0, -floatingHeaderHeight)
  }
}

const setCursorAfterVerticalMove = cursorTargetProject => {
  const cursorTarget = cursorTargetProject.querySelector('.name>.content')

  const selection = window.getSelection()
  state.set(s => ({
    anchorOffset: Math.max(selection.anchorOffset, s.anchorOffset)
  }))
  if (!cursorTarget.childNodes.length) {
    cursorTarget.append('')
  }
  const textNode = cursorTarget.childNodes[0]
  const range = document.createRange()
  range.setStart(textNode, Math.min(state.get().anchorOffset, textNode.length))
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  cursorTarget.focus()

  moveAboveFold(cursorTarget)
}

const moveDown = t => {
  const project = projectAncestor(t)
  let cursorTargetProject = project.className.includes('open')
    ? project.querySelector('.project')
    : project.nextElementSibling

  while(cursorTargetProject && cursorTargetProject.className.includes('childrenEnd')) {
    const sibling = projectAncestor(cursorTargetProject).nextElementSibling
    cursorTargetProject = (sibling.className.includes('childrenEnd') || sibling.className.includes('project')) && sibling
  }

  if (!cursorTargetProject) {
    return
  }

  setCursorAfterVerticalMove(cursorTargetProject)
}

const moveUp = t => {
  const project = projectAncestor(t) 
  let cursorTarget = null

  if (project.previousElementSibling) {
    cursorTarget = project.previousElementSibling
    if (cursorTarget.className.includes('open')) {
      const textContainers = cursorTarget.querySelectorAll('.project')
      cursorTarget = textContainers[textContainers.length - 1]
    }
  }

  if (!cursorTarget) {
    cursorTarget = projectAncestor(project) 
  }

  cursorTarget && setCursorAfterVerticalMove(cursorTarget)
}

const modeIndicator = (mainContainer, getState) => {
  const indicatorElement = document.createElement('div')
  indicatorElement.setAttribute('style', 'position: fixed; bottom:0; left: 0; background-color: grey; color: white; padding: .3em; font-family: sans-serif;')
  indicatorElement.innerHTML = 'NORMAL'
  document.querySelector('body').append(indicatorElement)

  mainContainer.addEventListener('vimflowy.stateChanged', () => {
    const {mode} = getState()
    indicatorElement.innerHTML = mode
  })
}

$(() => {
  const search = t => {
    const searchBox = document.getElementById('searchBox')
    searchBox.className += ' evenDirtierSearchHack'

    searchBox.focus()
  }

  window.toggleDebugging = () => state.set(s => ({
    debug: !s.debug
  }))
  document.getElementById('searchBox').addEventListener('focus', event => {
    if (event.sourceCapabilities) {
      return
    }

    if (event.target.className.includes('evenDirtierSearchHack')) {
      event.target.className = event.target.className.replace('evenDirtierSearchHack', '').trim()

      return
    }

    debug('dirty escape search hack')
    setCursorAfterVerticalMove(projectAncestor(event.relatedTarget))
  })
  document.getElementById('searchBox').addEventListener('keydown', event => {
    if (event.keyCode !== 13) {
      window.clearTimeout(state.get().searchFocusRetryTimeout)

      return
    }

    event.preventDefault()

    const focusFirstSearchResult = () => {
      const firstMatch = document.querySelector('.searching .mainTreeRoot .project')
      if (firstMatch) {
        setCursorAfterVerticalMove(firstMatch)
      }

      return Boolean(firstMatch)
    }

    const keepTrying = callback => {
      debug('trying to focus first search result')
      if (callback()) {
        return
      }

      const searchFocusRetryTimeout = window.setTimeout(() => {
        state.set(s => ({searchFocusRetryTimeout: null}))
        keepTrying(callback)
      }, 200)
      state.set(s => ({searchFocusRetryTimeout}))
    }

    keepTrying(focusFirstSearchResult)
  })

  modeIndicator(document.getElementById('pageContainer'), state.get)

  document.getElementById('pageContainer').addEventListener('keydown', event => {
    const e = jQuery.Event('keydown')

    const actionMap = {
      [Mode.NORMAL]: {
        j: moveDown,
        k: moveUp,
        h: t => moveCursorHorizontally(-1),
        l: t => moveCursorHorizontally(1),
        '/': search,
        '?': search,
        'alt-l': t => {
          state.set(s => ({anchorOffset: 0}))
          e.which = 39
          e.altKey = true
          $(t).trigger(e)
        },
        'alt-h': t => {
          state.set(s => ({anchorOffset: 0}))
          e.which = 37
          e.altKey = true
          $(t).trigger(e)
        },
        i: t => {
          state.set(s => ({mode: Mode.INSERT}))
        },
        escape: t => {
          state.set(s => ({mode: Mode.NORMAL}))
          moveCursorHorizontally(0)
        }
      },
      [Mode.INSERT]: {
        escape: t => {
          state.set(s => ({mode: Mode.NORMAL}))
          moveCursorHorizontally(0)
        }
      }
    }

    if (actionMap[state.get().mode][keyFrom(event)]) {
      event.preventDefault()

      debug(state.get().mode, event)

      actionMap[state.get().mode][keyFrom(event)](event.target)

      return
    }

    if (state.get().mode === Mode.NORMAL && !(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)) {
      event.preventDefault()

      debug('prevented because NORMAL mode', event)
    }
  })
})
