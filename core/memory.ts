export const TEXT_BASE = 0x00400000;
export const RDATA_BASE = 0x10000000;
export const DATA_BASE = 0x10010000;
export const STACK_BASE = 0x80000000;
const SEGMENT_SIZE = 1024 * 1024; // 1 MB
const STACK_START = STACK_BASE - SEGMENT_SIZE;

export class Memory {
  private textSegment = new DataView(new ArrayBuffer(SEGMENT_SIZE));
  private rdataSegment = new DataView(new ArrayBuffer(SEGMENT_SIZE));
  private dataSegment = new DataView(new ArrayBuffer(SEGMENT_SIZE));
  private stackSegment = new DataView(new ArrayBuffer(SEGMENT_SIZE));

  // Fungsi khusus untuk Loader (Assembler), bypass proteksi
  public load8(address: number, value: number): void {
    if (address >= RDATA_BASE && address < RDATA_BASE + SEGMENT_SIZE) {
      this.rdataSegment.setUint8(address - RDATA_BASE, value);
    } else if (address >= DATA_BASE && address < DATA_BASE + SEGMENT_SIZE) {
      this.dataSegment.setUint8(address - DATA_BASE, value);
    }
  }

  public load32(address: number, value: number): void {
    if (address >= TEXT_BASE && address < TEXT_BASE + SEGMENT_SIZE) {
      this.textSegment.setUint32(address - TEXT_BASE, value, false);
    } else if (address >= RDATA_BASE && address < RDATA_BASE + SEGMENT_SIZE) {
      this.rdataSegment.setUint32(address - RDATA_BASE, value, false);
    } else if (address >= DATA_BASE && address < DATA_BASE + SEGMENT_SIZE) {
      this.dataSegment.setUint32(address - DATA_BASE, value, false);
    }
  }

  // Fungsi Write CPU (Dengan Strict Protection)
  public write8(address: number, value: number): void {
    if (address >= TEXT_BASE && address < TEXT_BASE + SEGMENT_SIZE) throw new Error(`Segmentation Fault: Write Access Violation at .text (0x${address.toString(16)})`);
    if (address >= RDATA_BASE && address < RDATA_BASE + SEGMENT_SIZE) throw new Error(`Segmentation Fault: Write Access Violation at .rdata (0x${address.toString(16)})`);
    
    if (address >= DATA_BASE && address < DATA_BASE + SEGMENT_SIZE) {
      this.dataSegment.setUint8(address - DATA_BASE, value);
    } else if (address >= STACK_START && address < STACK_BASE) {
      this.stackSegment.setUint8(address - STACK_START, value);
    } else {
      throw new Error(`SegFault: Invalid 8-bit memory write at 0x${address.toString(16)}`);
    }
  }

  public write32(address: number, value: number): void {
    if (address >= TEXT_BASE && address < TEXT_BASE + SEGMENT_SIZE) throw new Error(`Segmentation Fault: Write Access Violation at .text (0x${address.toString(16)})`);
    if (address >= RDATA_BASE && address < RDATA_BASE + SEGMENT_SIZE) throw new Error(`Segmentation Fault: Write Access Violation at .rdata (0x${address.toString(16)})`);

    if (address >= DATA_BASE && address <= DATA_BASE + SEGMENT_SIZE - 4) {
      this.dataSegment.setUint32(address - DATA_BASE, value, false);
    } else if (address >= STACK_START && address <= STACK_BASE - 4) {
      this.stackSegment.setUint32(address - STACK_START, value, false);
    } else {
      throw new Error(`SegFault: Invalid 32-bit memory write at 0x${address.toString(16)}`);
    }
  }

  public read8(address: number): number {
    if (address >= RDATA_BASE && address < RDATA_BASE + SEGMENT_SIZE) return this.rdataSegment.getUint8(address - RDATA_BASE);
    if (address >= DATA_BASE && address < DATA_BASE + SEGMENT_SIZE) return this.dataSegment.getUint8(address - DATA_BASE);
    if (address >= STACK_START && address < STACK_BASE) return this.stackSegment.getUint8(address - STACK_START);
    throw new Error(`SegFault: Invalid 8-bit read at 0x${address.toString(16)}`);
  }

  public read32(address: number): number {
    if (address >= TEXT_BASE && address <= TEXT_BASE + SEGMENT_SIZE - 4) return this.textSegment.getUint32(address - TEXT_BASE, false);
    if (address >= RDATA_BASE && address <= RDATA_BASE + SEGMENT_SIZE - 4) return this.rdataSegment.getUint32(address - RDATA_BASE, false);
    if (address >= DATA_BASE && address <= DATA_BASE + SEGMENT_SIZE - 4) return this.dataSegment.getUint32(address - DATA_BASE, false);
    if (address >= STACK_START && address <= STACK_BASE - 4) return this.stackSegment.getUint32(address - STACK_START, false);
    throw new Error(`SegFault: Invalid 32-bit read at 0x${address.toString(16)}`);
  }

  public readString(address: number): string {
    let result = '';
    let currAddr = address;
    while (true) {
      let byte = 0;
      if (currAddr >= RDATA_BASE && currAddr < RDATA_BASE + SEGMENT_SIZE) byte = this.rdataSegment.getUint8(currAddr - RDATA_BASE);
      else if (currAddr >= DATA_BASE && currAddr < DATA_BASE + SEGMENT_SIZE) byte = this.dataSegment.getUint8(currAddr - DATA_BASE);
      else break;
      
      if (byte === 0) break;
      result += String.fromCharCode(byte);
      currAddr++;
    }
    return result;
  }

  public reset(): void {
    new Uint8Array(this.textSegment.buffer).fill(0);
    new Uint8Array(this.rdataSegment.buffer).fill(0);
    new Uint8Array(this.dataSegment.buffer).fill(0);
    new Uint8Array(this.stackSegment.buffer).fill(0);
  }

  public resetDataOnly(): void {
    new Uint8Array(this.dataSegment.buffer).fill(0);
    new Uint8Array(this.stackSegment.buffer).fill(0);
  }
}