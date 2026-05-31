'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    // Eye open — password visible
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    // Eye closed — password hidden
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function PasswordInput({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled?: boolean
  placeholder?: string
}) {
  const [show, setShow] = useState(false)

  return (
    <div className="w-full">
      <label className="block text-sm font-medium mb-1" style={{ color: '#8892b0', fontSize: '13px' }}>
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          required
          className="w-full px-4 py-2 rounded-lg transition-all pr-10"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'white',
            borderRadius: '10px',
            outline: 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#7c6bff'
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,107,255,0.2)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          disabled={disabled}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex items-center px-3 transition-colors"
          style={{ color: '#8892b0', background: 'transparent', border: 'none', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#7c6bff' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#8892b0' }}
        >
          <EyeIcon open={show} />
        </button>
      </div>
    </div>
  )
}

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const supabase = createClient()
      
      console.log('🔍 Attempting login for:', email)

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('✅ Login response:', data)
      console.log('❌ Login error:', signInError)

      if (signInError) {
        setError(signInError.message)
        setIsLoading(false)
        return
      }

      if (!data.user) {
        setError('Login failed - no user returned')
        setIsLoading(false)
        return
      }

      console.log('✅ User logged in successfully:', data.user.id)
      
      // Store user in auth store
      const { useAuthStore } = await import('@/store/auth-store')
      useAuthStore.getState().signIn({
        id: data.user.id,
        email: data.user.email || '',
        provider: 'supabase',
      })
      
      console.log('✅ User stored in auth store')
      router.push('/dashboard')
    } catch (err) {
      console.error('💥 Unexpected error:', err)
      setError('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="email"
        label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={isLoading}
        placeholder="your@email.com"
      />
      
      <PasswordInput
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={isLoading}
        placeholder="Enter your password"
      />

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full" isLoading={isLoading} style={{
        background: 'linear-gradient(135deg, #7c6bff, #00d4ff)',
        borderRadius: '12px',
        fontWeight: '600',
        border: 'none',
        padding: '12px',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease'
      }}>
        Sign In
      </Button>

      <div className="text-center text-sm">
        <Link href="/auth/reset-password" style={{ color: '#7c6bff' }} className="hover:underline">
          Forgot password?
        </Link>
      </div>

      <div className="text-center text-sm" style={{ color: '#8892b0' }}>
        Don&apos;t have an account?{' '}
        <Link href="/auth/register" style={{ color: '#7c6bff' }} className="hover:underline">
          Sign up
        </Link>
      </div>
    </form>
  )
}
