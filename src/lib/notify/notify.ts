import { prisma } from '@/lib/prisma'
import { NotificationType, Prisma } from '@prisma/client'
import nodemailer from 'nodemailer'

interface NotifyInput {
  userId: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, unknown>
}

/**
 * Create an in-app notification (persisted) for a user.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        data: (input.data ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
  } catch (err) {
    console.error('Failed to persist notification:', err)
  }

  // Fire-and-forget email for important events
  if (input.type === 'POST_FAILED' || input.type === 'ACCOUNT_DISCONNECTED') {
    void sendEmailForUser(input.userId, input.title, input.message).catch(() => {})
  }
}

/**
 * Mark notifications read.
 */
export async function markRead(userId: string, ids?: string[]): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, ...(ids ? { id: { in: ids } } : {}) },
    data: { read: true },
  })
}

async function sendEmailForUser(userId: string, subject: string, body: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } })
  if (!user?.email) return
  await sendEmail(user.email, subject, body)
}

let transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter
  const host = process.env.SMTP_HOST
  if (!host) return null
  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  })
  return transporter
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const t = getTransporter()
  if (!t) {
    console.warn('SMTP not configured; skipping email:', subject)
    return
  }
  await t.sendMail({ from: process.env.SMTP_FROM || 'noreply@socialscheduler.app', to, subject, text })
}
