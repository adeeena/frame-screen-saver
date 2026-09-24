import { Pipe, PipeTransform } from '@angular/core';
import { TranslationParams, TranslationService } from '../services/translation.service';

@Pipe({
  name: 'translate',
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  constructor(private readonly translationService: TranslationService) {}

  transform(key: string, params?: TranslationParams): string {
    return this.translationService.translate(key, params);
  }
}