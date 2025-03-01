import * as winston from 'winston';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

interface LoggerOptions {
  logLevel?: LogLevel;
  logFilePath?: string;
}

export class Logger {
  private readonly logger: winston.Logger;

  constructor(options: LoggerOptions = {}) {
    const { logLevel = LogLevel.INFO, logFilePath } = options;

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
          })
        ),
      }),
    ];

    if (logFilePath) {
      transports.push(
        new winston.transports.File({
          filename: logFilePath,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.json()
          ),
        })
      );
    }

    this.logger = winston.createLogger({
      level: logLevel,
      transports,
    });
  }

  info(message: string, meta?: Record<string, any>): void {
    this.logger.info(message, meta);
  }

  error(message: string, meta?: Record<string, any>): void {
    this.logger.error(message, meta);
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.logger.debug(message, meta);
  }

  // Метод для добавления новых транспортов в будущем
  addTransport(transport: winston.transport): void {
    this.logger.add(transport);
  }
}