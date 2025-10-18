import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as feather from 'feather-icons';

@Directive({
  selector: '[data-feather]',
  standalone: true,
})

export class FeatherIconDirective implements OnChanges {
  @Input('data-feather') iconName!: string;

  private platformId = inject(PLATFORM_ID);
  private el: ElementRef<HTMLElement> = inject(ElementRef);

  ngOnChanges(changes: SimpleChanges): void {
    if (isPlatformBrowser(this.platformId) && changes['iconName']) {
      this.el.nativeElement.innerHTML = (feather.icons as any)[this.iconName]?.toSvg() || '';
    }
  }
}
