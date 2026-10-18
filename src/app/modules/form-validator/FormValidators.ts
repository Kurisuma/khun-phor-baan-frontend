import { Injectable } from '@angular/core';
import { AbstractControl, ValidationErrors, Validators } from '@angular/forms';

@Injectable({ providedIn: 'root' })
export class FormValidators {
  public readonly version = '1.0.0';
  public readonly email = [Validators.required, Validators.email];
  public readonly password = [Validators.required, Validators.minLength(12), this.noWhitespace];
  public readonly requiredText = [Validators.required, this.noWhitespace];

  noWhitespace(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value ?? '');
    return value.trim().length === 0 ? { whitespace: true } : null;
  }

  jsonObject(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value ?? '').trim();
    if (!value) return null;
    try {
      return JSON.parse(value) && typeof JSON.parse(value) === 'object' ? null : { jsonObject: true };
    } catch {
      return { jsonObject: true };
    }
  }
}
