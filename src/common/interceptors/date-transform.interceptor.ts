import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class DateTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => this.transformDates(data)),
    );
  }

  private transformDates(data: any): any {
    if (!data) return data;

    if (Array.isArray(data)) {
      return data.map((item) => this.transformDates(item));
    }

    if (data instanceof Date) {
      return this.formatDateToBrazil(data);
    }

    if (typeof data === 'object') {
      const transformed = {};
      for (const key in data) {
        if (data[key] instanceof Date) {
          transformed[key] = this.formatDateToBrazil(data[key]);
        } else if (typeof data[key] === 'object') {
          transformed[key] = this.transformDates(data[key]);
        } else {
          transformed[key] = data[key];
        }
      }
      return transformed;
    }

    return data;
  }

  private formatDateToBrazil(date: Date): string {
    // Converte para o horário de Brasília (UTC-3)
    const brasiliaOffset = -3 * 60; // -3 horas em minutos
    const utcDate = new Date(date.getTime() + brasiliaOffset * 60 * 1000);
    
    return utcDate.toISOString().replace('Z', '-03:00');
  }
}
