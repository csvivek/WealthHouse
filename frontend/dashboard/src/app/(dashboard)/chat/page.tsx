'use client'

import { useState, useRef, useEffect } from 'react'
import { Bot, Send, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const initialMessage: Message = {
  id: 'msg-0',
  role: 'assistant',
  content:
    "Hi! I'm your WealthHouse AI assistant. Ask me anything about your finances — spending patterns, investment performance, net worth breakdown, or financial planning advice.",
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([initialMessage])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const msgCounter = useRef(1)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  const handleSend = async () => {
    const text = input.trim()
    if (!text) return

    const userMsg: Message = {
      id: `msg-${msgCounter.current++}`,
      role: 'user',
      content: text,
    }

    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setIsTyping(true)

    try {
      const history = updatedMessages
        .filter((m) => m.id !== initialMessage.id)
        .map(({ role, content }) => ({ role, content }))

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
      })

      const data = await res.json()

      const assistantMsg: Message = {
        id: `msg-${msgCounter.current++}`,
        role: 'assistant',
        content: res.ok && data.response
          ? data.response
          : "Sorry, I couldn't process that request. Please try again.",
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch {
      const errorMsg: Message = {
        id: `msg-${msgCounter.current++}`,
        role: 'assistant',
        content: "Sorry, I couldn't process that request. Please try again.",
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-3xl font-bold tracking-tight">AI Financial Advisor</h1>
        <p className="text-muted-foreground">Chat with your personal finance assistant.</p>
      </div>

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
                    'max-w-[75%] rounded-lg px-4 py-2.5 text-sm',
                    message.role === 'assistant'
                      ? 'bg-muted text-foreground'
                      : 'bg-primary text-primary-foreground'
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex items-start gap-3">
                <Avatar className="size-8 shrink-0">
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <Bot className="size-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="rounded-lg bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                  Thinking…
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t p-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
          >
            <Input
              placeholder="Ask about your finances..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isTyping}
              className="flex-1"
            />
            <Button type="submit" disabled={!input.trim() || isTyping}>
              <Send className="size-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
