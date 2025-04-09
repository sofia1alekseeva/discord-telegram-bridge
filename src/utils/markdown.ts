export function escapeMarkdownV2(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
  }
  
  export function escapeMediaCaption(text: string): string {
    return escapeMarkdownV2(text)
      .replace(/\n/g, ' ')
      .substring(0, 1024);
  }