'use client'

import { startTransition, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Bot, RotateCcw, Send, User } from 'lucide-react'
import { ExecutivePage, ExecutivePageHeader } from '@/components/executive/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { ChatAssistantContext, ChatSessionPayload } from '@/lib/ai/chat/types'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  assistantContext?: ChatAssistantContext | null
}

type StreamEvent =
  | { event: 'status'; payload: { message?: string } }
  | { event: 'delta'; payload: { text?: string } }
  | { event: 'done'; payload: { assistantContext?: ChatAssistantContext | null } }
  | { event: 'error'; payload: { message?: string } }

const initialMessage: Message = {
  id: 'msg-0',
  role: 'assistant',
  content:
    "Hi! I'm your Wealth House chat assistant. Ask about spending, net worth, cash flow, advances, or account balances.",
}

function MarkdownBubble({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-3 list-disc pl-5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 list-decimal pl-5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="mb-1">{children}</li>,
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto rounded-md border border-border/60 last:mb-0">
            <table className="min-w-full border-collapse text-left text-xs sm:text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-background/70">{children}</thead>,
        th: ({ children }) => <th className="border-b border-border/60 px-3 py-2 font-semibold">{children}</th>,
        td: ({ children }) => <td className="border-b border-border/40 px-3 py-2 align-top last:border-b-0">{children}</td>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

async function readEventStream(
  response: Response,
  onEvent: (event: StreamEvent) => void,
) {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Streaming response body is unavailable.')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')

      const lines = rawEvent.split('\n')
      const eventName = lines.find((line) => line.startsWith('event: '))?.slice(7).trim()
      const payloadRaw = lines
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n')

      if (!eventName || !payloadRaw) continue

      try {
        const payload = JSON.parse(payloadRaw) as Record<string, unknown>
        if (eventName === 'status') {
          onEvent({ event: 'status', payload: { message: typeof payload.message === 'string' ? payload.message : undefined } })
        } else if (eventName === 'delta') {
          onEvent({ event: 'delta', payload: { text: typeof payload.text === 'string' ? payload.text : undefined } })
        } else if (eventName === 'done') {
          onEvent({
            event: 'done',
            payload: {
              assistantContext: (payload.assistantContext as ChatAssistantContext | null | undefined) ?? null,
            },
          })
        } else if (eventName === 'error') {
          onEvent({ event: 'error', payload: { message: typeof payload.message === 'string' ? payload.message : undefined } })
        }
      } catch {
        // Ignore malformed events and keep consuming the stream.
      }
    }

    if (done) break
  }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([initialMessage])
  const [input, setInput] = useState('')
  const [session, setSession] = useState<ChatSessionPayload | null>(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const msgCounter = useRef(1)

  useEffect(() => {
    let active = true

    async function loadSession() {
      try {
        const response = await fetch('/api/ai/chat/session', { method: 'GET' })
        if (!response.ok) {
          throw new Error('Failed to load chat session.')
        }

        const payload = await response.json() as ChatSessionPayload
        if (!active) return
        setSession(payload)
      } catch {
        if (!active) return
        setSession(null)
      } finally {
        if (active) {
          setLoadingSession(false)
        }
      }
    }

    void loadSession()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, statusText, isStreaming])

  function resetChat() {
    setMessages([initialMessage])
    setInput('')
    setStatusText(null)
    setIsStreaming(false)
  }

  async function sendMessage(rawText?: string) {
    const text = (rawText ?? input).trim()
    if (!text || isStreaming) return

    const userMsg: Message = {
      id: `msg-${msgCounter.current++}`,
      role: 'user',
      content: text,
    }
    const assistantMsgId = `msg-${msgCounter.current++}`
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      assistantContext: null,
    }

    const updatedMessages = [...messages, userMsg, assistantMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsStreaming(true)
    setStatusText('Routing request')

    try {
      const history = messages
        .filter((message) => message.id !== initialMessage.id)
        .map(({ role, content, assistantContext }) => ({
          role,
          content,
          assistantContext: role === 'assistant' ? assistantContext ?? null : undefined,
        }))

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history,
          sessionContext: session,
        }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null)
        throw new Error(errorPayload?.error ?? 'Sorry, I could not process that request.')
      }

      await readEventStream(response, (event) => {
        if (event.event === 'status') {
          setStatusText(event.payload.message ?? null)
          return
        }

        if (event.event === 'delta') {
          if (!event.payload.text) return
          startTransition(() => {
            setMessages((current) => current.map((message) => (
              message.id === assistantMsgId
                ? { ...message, content: `${message.content}${event.payload.text ?? ''}` }
                : message
            )))
          })
          return
        }

        if (event.event === 'done') {
          setStatusText(null)
          setMessages((current) => current.map((message) => (
            message.id === assistantMsgId
              ? { ...message, assistantContext: event.payload.assistantContext ?? null }
              : message
          )))
          return
        }

        if (event.event === 'error') {
          throw new Error(event.payload.message ?? 'Sorry, I could not process that request.')
        }
      })
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'Sorry, I could not process that request.'

      setMessages((current) => current.map((message) => (
        message.id === assistantMsgId
          ? { ...message, content: errorMessage }
          : message
      )))
    } finally {
      setStatusText(null)
      setIsStreaming(false)
    }
  }

  const showPromptChips = !loadingSession && messages.every((message) => message.role !== 'user')

  return (
    <ExecutivePage className="flex h-[calc(100vh-7rem)] flex-col">
      <ExecutivePageHeader
        eyebrow="System Workspace"
        title="AI Financial Advisor"
        description="Ask Wealth House about spending, net worth, cash flow, advances, and account balances with live household data."
        actions={(
          <Button type="button" variant="outline" onClick={resetChat} disabled={isStreaming}>
            <RotateCcw className="mr-2 size-4" />
            New Chat
          </Button>
        )}
      />

      <div className="flex flex-1 flex-col overflow-hidden rounded-lg border bg-background">
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex items-start gap-3',
                  message.role === 'user' && 'flex-row-reverse'
                )}
              >
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback
                    className={cn(
                      message.role === 'assistant'
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-primary text-primary-foreground'
                    )}
                  >
                    {message.role === 'assistant' ? (
                      <Bot className="size-4" />
                    ) : (
                      <User className="size-4" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    'max-w-[85%] rounded-lg px-4 py-2.5 text-sm',
                    message.role === 'assistant'
                      ? 'bg-muted text-foreground'
                      : 'bg-primary text-primary-foreground'
                  )}
                >
                  {message.role === 'assistant'
                    ? (
                      message.content
                        ? <MarkdownBubble content={message.content} />
                        : <span className="text-muted-foreground">{statusText ?? 'Thinking…'}</span>
                    )
                    : message.content}
                </div>
              </div>
            ))}

            {showPromptChips && session?.promptChips?.length ? (
              <div className="flex flex-wrap gap-2 pt-2">
                {session.promptChips.map((prompt) => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void sendMessage(prompt)
                    }}
                    disabled={isStreaming}
                    className="h-auto whitespace-normal text-left"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void sendMessage()
            }}
          >
            <Input
              placeholder="Ask about your finances..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isStreaming}
              className="flex-1"
            />
            <Button type="submit" disabled={!input.trim() || isStreaming}>
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </ExecutivePage>
  )
}
