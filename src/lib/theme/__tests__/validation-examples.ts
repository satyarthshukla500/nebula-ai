/**
 * Theme Validation Examples
 * 
 * This file demonstrates various use cases for the theme validation functions.
 * These examples show how to use the validation API in real-world scenarios.
 */

import {
  validateThemeConfig,
  isValidColor,
  validatePartialTheme,
  validateMultipleThemes,
  isUniqueThemeName,
} from '../validation'
import type { ThemeConfig } from '@/types/theme'

// ============================================================================
// Example 1: Validating a complete theme before saving
// ============================================================================

export function exampleValidateBeforeSave(theme: ThemeConfig): boolean {
  const result = validateThemeConfig(theme)
  
  if (!result.isValid) {
    console.error('Theme validation failed:')
    result.errors.forEach(error => {
      console.error(`  - ${error.field}: ${error.message}`)
    })
    return false
  }
  
  console.log('✅ Theme is valid and ready to save')
  return true
}

// ============================================================================
// Example 2: Validating user input for color picker
// ============================================================================

export function exampleValidateColorInput(colorValue: string): {
  isValid: boolean
  message: string
} {
  if (!colorValue || colorValue.trim() === '') {
    return {
      isValid: false,
      message: 'Color value cannot be empty',
    }
  }
  
  if (!isValidColor(colorValue)) {
    return {
      isValid: false,
      message: 'Please enter a valid color (hex, rgb, or hsl)',
    }
  }
  
  return {
    isValid: true,
    message: 'Valid color',
  }
}

// ============================================================================
// Example 3: Validating partial theme updates in real-time
// ============================================================================

export function exampleValidateRealtimeUpdate(
  field: string,
  value: string | number | boolean
): { isValid: boolean; error?: string } {
  // Create partial theme with just the updated field
  const partial: Partial<ThemeConfig> = {}
  
  // Parse field path (e.g., "colors.primary" or "effects.glowIntensity")
  const [section, key] = field.split('.')
  
  if (section === 'colors') {
    partial.colors = { [key]: value as string } as any
  } else if (section === 'effects') {
    partial.effects = { [key]: value } as any
  }
  
  const result = validatePartialTheme(partial)
  
  if (!result.isValid) {
    return {
      isValid: false,
      error: result.errors[0]?.message || 'Invalid value',
    }
  }
  
  return { isValid: true }
}

// ============================================================================
// Example 4: Batch validation of imported themes
// ============================================================================

export function exampleValidateImportedThemes(
  themes: ThemeConfig[]
): {
  valid: ThemeConfig[]
  invalid: Array<{ theme: ThemeConfig; errors: string[] }>
} {
  const valid: ThemeConfig[] = []
  const invalid: Array<{ theme: ThemeConfig; errors: string[] }> = []
  
  const results = validateMultipleThemes(themes)
  
  for (const theme of themes) {
    const result = results.get(theme.name)
    
    if (result?.isValid) {
      valid.push(theme)
    } else {
      invalid.push({
        theme,
        errors: result?.errors.map(e => `${e.field}: ${e.message}`) || [],
      })
    }
  }
  
  return { valid, invalid }
}

// ============================================================================
// Example 5: Validating theme name uniqueness
// ============================================================================

export function exampleValidateThemeName(
  name: string,
  existingThemes: ThemeConfig[]
): { isValid: boolean; message: string } {
  if (!name || name.trim() === '') {
    return {
      isValid: false,
      message: 'Theme name cannot be empty',
    }
  }
  
  if (name.length < 3) {
    return {
      isValid: false,
      message: 'Theme name must be at least 3 characters',
    }
  }
  
  if (name.length > 50) {
    return {
      isValid: false,
      message: 'Theme name must be less than 50 characters',
    }
  }
  
  if (!isUniqueThemeName(name, existingThemes)) {
    return {
      isValid: false,
      message: 'A theme with this name already exists',
    }
  }
  
  return {
    isValid: true,
    message: 'Theme name is valid',
  }
}

// ============================================================================
// Example 6: Validating numeric range with user-friendly messages
// ============================================================================

export function exampleValidateEffectValue(
  effectName: 'glowIntensity' | 'animationSpeed' | 'particleDensity' | 'blurAmount',
  value: number
): { isValid: boolean; message: string } {
  const ranges = {
    glowIntensity: { min: 0, max: 100, unit: '%' },
    animationSpeed: { min: 0.5, max: 2.0, unit: 'x' },
    particleDensity: { min: 0, max: 100, unit: '%' },
    blurAmount: { min: 0, max: 20, unit: 'px' },
  }
  
  const range = ranges[effectName]
  
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return {
      isValid: false,
      message: 'Please enter a valid number',
    }
  }
  
  if (value < range.min || value > range.max) {
    return {
      isValid: false,
      message: `Value must be between ${range.min}${range.unit} and ${range.max}${range.unit}`,
    }
  }
  
  return {
    isValid: true,
    message: `Valid ${effectName}`,
  }
}

// ============================================================================
// Example 7: Comprehensive theme validation with detailed feedback
// ============================================================================

export function exampleValidateWithDetailedFeedback(theme: ThemeConfig): {
  isValid: boolean
  summary: string
  details: Array<{ category: string; issues: string[] }>
} {
  const result = validateThemeConfig(theme)
  
  if (result.isValid) {
    return {
      isValid: true,
      summary: '✅ Theme is valid and ready to use',
      details: [],
    }
  }
  
  // Group errors by category
  const errorsByCategory = new Map<string, string[]>()
  
  for (const error of result.errors) {
    const category = error.field.split('.')[0] || 'general'
    const issues = errorsByCategory.get(category) || []
    issues.push(`${error.field}: ${error.message}`)
    errorsByCategory.set(category, issues)
  }
  
  const details = Array.from(errorsByCategory.entries()).map(([category, issues]) => ({
    category,
    issues,
  }))
  
  return {
    isValid: false,
    summary: `❌ Found ${result.errors.length} validation error(s)`,
    details,
  }
}

// ============================================================================
// Example 8: Validating theme before applying to prevent UI breaks
// ============================================================================

export function exampleSafeThemeApplication(
  newTheme: ThemeConfig,
  fallbackTheme: ThemeConfig
): ThemeConfig {
  const result = validateThemeConfig(newTheme)
  
  if (result.isValid) {
    console.log('✅ Applying new theme:', newTheme.name)
    return newTheme
  }
  
  console.error('❌ Theme validation failed, using fallback theme')
  console.error('Errors:', result.errors)
  
  return fallbackTheme
}

// ============================================================================
// Jest requires at least one test — these examples are utility functions,
// not test cases. This placeholder satisfies the requirement.
// ============================================================================

describe('validation-examples (utility module)', () => {
  it('exports all example functions', () => {
    expect(typeof exampleValidateBeforeSave).toBe('function')
    expect(typeof exampleValidateColorInput).toBe('function')
    expect(typeof exampleValidateRealtimeUpdate).toBe('function')
    expect(typeof exampleValidateImportedThemes).toBe('function')
    expect(typeof exampleValidateThemeName).toBe('function')
    expect(typeof exampleValidateEffectValue).toBe('function')
    expect(typeof exampleValidateWithDetailedFeedback).toBe('function')
    expect(typeof exampleSafeThemeApplication).toBe('function')
  })
})
