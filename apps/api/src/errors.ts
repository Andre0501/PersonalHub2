import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
@Catch()
export class SafeErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (error instanceof HttpException) {
      const code = error.getStatus(),
        body = error.getResponse();
      if (typeof body === 'object' && 'code' in body && 'message' in body)
        return response.status(code).json({ code: body.code, message: body.message });
      return response
        .status(code)
        .json({
          code: 'HTTP_' + code,
          message: code === 404 ? 'Rota indisponível.' : 'Requisição inválida.',
        });
    }
    return response.status(500).json({ code: 'INTERNAL_ERROR', message: 'Falha ao processar a operação.' });
  }
}
