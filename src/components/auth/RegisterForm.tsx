'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
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

export function RegisterForm() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
  })
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      
      // Debug logging
      console.log('🔍 Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
      console.log('🔍 Attempting signup for:', formData.email)

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.fullName,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      console.log('✅ Signup response:', data)
      console.log('❌ Signup error:', signUpError)

      if (signUpError) {
        setError(signUpError.message)
        setIsLoading(false)
        return
      }

      if (!data.user) {
        setError('User creation failed - no user returned')
        setIsLoading(false)
        return
      }

      console.log('✅ User created successfully:', data.user.id)
      setSuccess(true)
      
      // Check if email confirmation is required
      if (data.user && !data.session) {
        setTimeout(() => {
          setError('')
          setSuccess(false)
          alert('Please check your email to verify your account before logging in.')
          router.push('/auth/login')
        }, 2000)
      } else {
        setTimeout(() => router.push('/auth/login'), 2000)
      }
    } catch (err) {
      console.error('💥 Unexpected error:', err)
      setError('An unexpected error occurred. Please try again.')
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg">
        <p className="font-medium">Registration successful!</p>
        <p className="text-sm mt-1">Redirecting to login...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="text"
        label="Full Name"
        value={formData.fullName}
        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
        required
        disabled={isLoading}
        placeholder="John Doe"
      />

      <Input
        type="email"
        label="Email"
        value={formData.email}
        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        required
        disabled={isLoading}
        placeholder="your@email.com"
      />
      
      <PasswordInput
        label="Password"
        value={formData.password}
        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
        disabled={isLoading}
        placeholder="At least 8 characters"
      />

      <PasswordInput
        label="Confirm Password"
        value={formData.confirmPassword}
        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
        disabled={isLoading}
        placeholder="Re-enter password"
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
        Create Account
      </Button>

      <div className="text-center text-sm" style={{ color: '#8892b0' }}>
        Already have an account?{' '}
        <Link href="/auth/login" style={{ color: '#7c6bff' }} className="hover:underline">
          Sign in
        </Link>
      </div>
    </form>
  )
}
