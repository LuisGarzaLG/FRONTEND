import { Component } from '@angular/core';
import { SimulacionService } from '../servicios/simulacion.service';
import * as math from 'mathjs';
import * as ExcelJS from 'exceljs';
import * as FileSaver from 'file-saver';
import { saveAs } from 'file-saver';


interface Registro {
  Empleado: string;
  Tipo: string;
  TipoDocumento: string;
  Documento: string;
  Llegada: number;
  Inicio: number;
  Salida: number;
  Espera: number;
  Duracion: number;
  Impresora_ID: string | number;
}

interface EstadisticasTipo {
  promedioDuracion: number;
}

interface Estadisticas {
  BN: EstadisticasTipo;
  Color: EstadisticasTipo;
}

interface Rendimiento {
  BN: number;
  Color: number;
}
interface ConteoImpresoras {
  [nombre: string]: number;
}

@Component({
  selector: 'app-simulador',
  templateUrl: './simulador.component.html',
  styleUrls: ['./simulador.component.scss']
})
export class SimuladorComponent {
  parametros = {
    num_personas: 100,
    tiempo_llegadas: 2,
    tiempo_simulacion: 1000,
    duracion_bn: [1, 3],
    duracion_color: [4, 10],
    impresoras_bn: 1,
    impresoras_color: 1
  };

  validacionModelo = {
    BN: { teorico: 0, simulado: 0, diferencia: 0 },
    Color: { teorico: 0, simulado: 0, diferencia: 0 }
  };

  conteoImpresoras: ConteoImpresoras = {};
  registros: Registro[] = [];
  chartData: { name: string; value: number }[] = [];
  chartData2: { name: string; value: number }[] = [];
  rendimiento: Rendimiento = { BN: 0, Color: 0 };
  estadisticas: Estadisticas = {
    BN: { promedioDuracion: 0 },
    Color: { promedioDuracion: 0 }
  };
  colaVisualizada: string[] = [];
  impacto: string = '';

  colorScheme = {
    domain: ['#3366FF', '#FF9933']
  };

  constructor(private simService: SimulacionService) {}

  simulacionEjecutada = false;

ejecutarSimulacion() {
  this.simulacionEjecutada = false;
  this.simService.simular(this.parametros).subscribe({
    next: (res: any) => {
      this.registros = res.registros;
      this.conteoImpresoras = res.conteo_impresoras || {};

      this.updateCharts();
      this.estadisticas = this.calcularEstadisticas();
      this.rendimiento = this.calcularRendimiento();

      this.validarModelo();
      this.calcularImpacto();
      this.mostrarEventosPasoAPaso();

      this.simulacionEjecutada = true;
    },
    error: (err) => {
      console.error('Error en simulación:', err);
      this.simulacionEjecutada = false;
    }
  });
}


  validarModelo() {
  const llegadasTotales = this.parametros.num_personas / this.parametros.tiempo_simulacion;
  const durBN = this.promedioDuracion('BN') || 0.0001;
  const durColor = this.promedioDuracion('COLOR') || 0.0001;

  const muBN = 1 / durBN;
  const muColor = 1 / durColor;

  console.log('Validando modelo...');
  console.log('Llegadas totales (λ):', llegadasTotales);
  console.log('Duración promedio BN:', durBN);
  console.log('Duración promedio Color:', durColor);
  console.log('Mu BN:', muBN, 'Mu Color:', muColor);

  const teoricoBN = this.redondear(this.calcularTeoricoMMC(llegadasTotales, muBN, this.parametros.impresoras_bn));
  const teoricoColor = this.redondear(this.calcularTeoricoMMC(llegadasTotales, muColor, this.parametros.impresoras_color));

  const simBN = this.redondear(this.promedioEspera('BN'));
  const simColor = this.redondear(this.promedioEspera('COLOR'));

  this.validacionModelo = {
    BN: {
      teorico: teoricoBN,
      simulado: simBN,
      diferencia: this.redondear(Math.abs(simBN - teoricoBN))
    },
    Color: {
      teorico: teoricoColor,
      simulado: simColor,
      diferencia: this.redondear(Math.abs(simColor - teoricoColor))
    }
  };
}

private redondear(valor: number): number {
  return Math.round(valor * 100) / 100;
}


  calcularTeoricoMMC(lambda: number, mu: number, c: number): number {
    const rho = lambda / (c * mu);
    if (rho >= 1) return Infinity;

    let sum = 0;
    for (let n = 0; n < c; n++) {
      sum += Math.pow(lambda / mu, n) / math.factorial(n);
    }

    const p0Inv = sum + (Math.pow(lambda / mu, c) / (math.factorial(c) * (1 - rho)));
    const p0 = 1 / p0Inv;

    const Lq = (Math.pow(lambda / mu, c) * lambda * mu) / (math.factorial(c) * Math.pow(c * mu - lambda, 2)) * p0;
    const Wq = Lq / lambda;

    return Number(Wq.toFixed(2));
  }

  promedioDuracion(tipo: string): number {
    const registrosTipo = this.registros.filter(r => r.Tipo.toUpperCase() === tipo.toUpperCase());
    return registrosTipo.length > 0
      ? registrosTipo.reduce((acc, r) => acc + r.Duracion, 0) / registrosTipo.length
      : 0;
  }

  promedioEspera(tipo: string): number {
    const registrosTipo = this.registros.filter(r => r.Tipo.toUpperCase() === tipo.toUpperCase());
    return registrosTipo.length > 0
      ? registrosTipo.reduce((acc, r) => acc + r.Espera, 0) / registrosTipo.length
      : 0;
  }

  getTiempoOcupado(tipo: string): number {
    const registrosTipo = this.registros.filter(r => r.Tipo.toUpperCase() === tipo.toUpperCase());
    return registrosTipo.reduce((acc, curr) => acc + curr.Duracion, 0);
  }

  updateCharts() {
    this.chartData = [
      { name: 'Impresoras BN', value: this.getTiempoOcupado('BN') },
      { name: 'Impresoras Color', value: this.getTiempoOcupado('COLOR') }
    ];

    this.chartData2 = [
      { name: 'BN', value: this.promedioEspera('BN') },
      { name: 'Color', value: this.promedioEspera('COLOR') }
    ];
  }

  calcularEstadisticas(): Estadisticas {
    const registrosBN = this.registros.filter(r => r.Tipo.toUpperCase() === 'BN');
    const registrosColor = this.registros.filter(r => r.Tipo.toUpperCase() === 'COLOR');

    const promedioDuracionBN = registrosBN.length > 0
      ? registrosBN.reduce((acc, r) => acc + r.Duracion, 0) / registrosBN.length
      : 0;

    const promedioDuracionColor = registrosColor.length > 0
      ? registrosColor.reduce((acc, r) => acc + r.Duracion, 0) / registrosColor.length
      : 0;

    return {
      BN: { promedioDuracion: promedioDuracionBN },
      Color: { promedioDuracion: promedioDuracionColor }
    };
  }

  calcularRendimiento(): Rendimiento {
    const tiempoTotal = this.parametros.tiempo_simulacion;
    const tiempoOcupadoBN = this.getTiempoOcupado('BN');
    const tiempoOcupadoColor = this.getTiempoOcupado('COLOR');

    return {
      BN: (tiempoOcupadoBN / tiempoTotal) * 100,
      Color: (tiempoOcupadoColor / tiempoTotal) * 100
    };
  }

  mostrarEventosPasoAPaso(): void {
    this.colaVisualizada = [];
    let i = 0;
    const ordenados = [...this.registros].sort((a, b) => a.Llegada - b.Llegada);

    const intervalo = setInterval(() => {
      if (i >= ordenados.length) {
        clearInterval(intervalo);
        return;
      }

      const r = ordenados[i];
      this.colaVisualizada.push(`🟡El ${r.Empleado} llegó en ${r.Llegada} segundos e imprimió en ${r.Salida} segundos`);
      i++;
    }, 500);
  }

  calcularImpacto(): void {
    const esperaBN = this.promedioEspera('BN');
    const esperaColor = this.promedioEspera('COLOR');
    const rendimientoBN = this.rendimiento.BN;
    const rendimientoColor = this.rendimiento.Color;
    const totalBN = this.registros.filter(r => r.Tipo === 'BN').length;
    const totalColor = this.registros.filter(r => r.Tipo === 'COLOR').length;

    const bnRecomendacion = this.parametros.impresoras_bn > 1 && esperaBN < 2
      ? '✔️ Usar más de 1 impresora B/N reduce significativamente la espera.'
      : '⚠️ Una impresora B/N puede ser insuficiente si hay mucha carga.';

    const colorRecomendacion = this.parametros.impresoras_color > 1 && esperaColor < 2
      ? '✔️ Más impresoras color ayudan a reducir la espera.'
      : '⚠️ Una impresora color puede causar cuellos de botella si se usa mucho.';

    this.impacto = `B/N: ${this.parametros.impresoras_bn} impresora(s), espera promedio: ${esperaBN.toFixed(2)} seg, uso: ${rendimientoBN.toFixed(1)}%, trabajos: ${totalBN}.\n${bnRecomendacion}\n\nColor: ${this.parametros.impresoras_color} impresora(s), espera promedio: ${esperaColor.toFixed(2)} seg, uso: ${rendimientoColor.toFixed(1)}%, trabajos: ${totalColor}.\n${colorRecomendacion}`;
  }
svgToBase64(svgElement: SVGElement): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svgElement);

      // Añadir namespace si falta (importante)
      if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
        svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      if (!svgString.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
        svgString = svgString.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }

      const encoded = window.btoa(unescape(encodeURIComponent(svgString)));
      resolve('data:image/svg+xml;base64,' + encoded);
    } catch (e) {
      reject(e);
    }
  });
}




async exportarExcel() {
  const workbook = new ExcelJS.Workbook();

  // Función para agregar bordes y ajustar ancho de columnas al contenido
  function formatSheet(sheet: ExcelJS.Worksheet) {
    sheet.columns.forEach((column) => {
      if (!column || !column.eachCell) return; // seguridad TS
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
        // Bordes para todas las celdas
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };

        // Ajustar ancho basado en texto
        const cellValue = cell.value ? cell.value.toString() : '';
        if (cellValue.length > maxLength) maxLength = cellValue.length;

        // Estilo solo para la primera fila (encabezados)
        if (rowNumber === 1) {
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; // letra blanca
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' }, // azul oscuro fondo
          };
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });
      column.width = maxLength + 2; // padding extra
    });
  }


  // --- Hoja 1: Registros ---
  const registrosSheet = workbook.addWorksheet('Registros');
  registrosSheet.columns = [
    { header: 'Empleado', key: 'Empleado', width: 15 },
    { header: 'Tipo', key: 'Tipo', width: 10 },
    { header: 'Tipo Documento', key: 'TipoDocumento', width: 15 },
    { header: 'Documento', key: 'Documento', width: 15 },
    { header: 'Llegada', key: 'Llegada', width: 10 },
    { header: 'Inicio', key: 'Inicio', width: 10 },
    { header: 'Salida', key: 'Salida', width: 10 },
    { header: 'Espera', key: 'Espera', width: 10 },
    { header: 'Duración', key: 'Duracion', width: 10 },
    { header: 'Impresora ID', key: 'Impresora_ID', width: 15 }
  ];
  this.registros.forEach(r => registrosSheet.addRow(r));
  formatSheet(registrosSheet);

  // --- Hoja 2: Estadísticas ---
  const estadisticasSheet = workbook.addWorksheet('Estadísticas');
  estadisticasSheet.addRow(['Tipo', 'Promedio Duración']);
  estadisticasSheet.addRow(['BN', this.estadisticas.BN.promedioDuracion]);
  estadisticasSheet.addRow(['Color', this.estadisticas.Color.promedioDuracion]);
  formatSheet(estadisticasSheet);

  // --- Hoja 3: Rendimiento ---
  const rendimientoSheet = workbook.addWorksheet('Rendimiento');
  rendimientoSheet.addRow(['Tipo', 'Porcentaje de uso (%)']);
  rendimientoSheet.addRow(['BN', this.rendimiento.BN]);
  rendimientoSheet.addRow(['Color', this.rendimiento.Color]);
  formatSheet(rendimientoSheet);

  // --- Hoja 4: Validación Modelo M/M/c ---
  const validacionSheet = workbook.addWorksheet('Validación Modelo');
  validacionSheet.addRow(['Tipo', 'Teórico (Wq)', 'Simulado', 'Diferencia']);
  validacionSheet.addRow([
    'BN',
    this.validacionModelo.BN.teorico,
    this.validacionModelo.BN.simulado,
    this.validacionModelo.BN.diferencia
  ]);
  validacionSheet.addRow([
    'Color',
    this.validacionModelo.Color.teorico,
    this.validacionModelo.Color.simulado,
    this.validacionModelo.Color.diferencia
  ]);
  formatSheet(validacionSheet);

  // --- Hoja 5: Impacto y recomendaciones ---
  const impactoSheet = workbook.addWorksheet('Impacto');
  impactoSheet.addRow(['Impacto de la simulación']);
  impactoSheet.addRow([]);
  this.impacto.split('\n').forEach(linea => impactoSheet.addRow([linea]));
  formatSheet(impactoSheet);

  // --- Hoja 6: Parámetros ---
  const parametrosSheet = workbook.addWorksheet('Parámetros');
  Object.entries(this.parametros).forEach(([clave, valor], index) => {
    if (Array.isArray(valor)) {
      parametrosSheet.addRow([clave, valor.join(' - ')]);
    } else {
      parametrosSheet.addRow([clave, valor]);
    }
  });
  formatSheet(parametrosSheet);

  // --- Hoja 7: Gráficas ---
  
  // Función para convertir SVG a PNG base64 (canvas)
  const svgToPng = (svgEl: SVGElement): Promise<string> => {
    return new Promise((resolve, reject) => {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgEl);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const scale = 0.7;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        if (ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const pngBase64 = canvas.toDataURL('image/png');
        resolve(pngBase64);
      };
      img.onerror = e => reject(e);
      img.src = url;
    });
  };

  const svg1 = document.querySelector('#chart1 svg') as SVGElement | null;
  const svg2 = document.querySelector('#chart2 svg') as SVGElement | null;

  if (!svg1 || !svg2) {
    alert('No se encontraron los gráficos para exportar.');
  } else {
    try {
      const pngImg1 = await svgToPng(svg1);
      const pngImg2 = await svgToPng(svg2);

      const imageId1 = workbook.addImage({
        base64: pngImg1,
        extension: 'png',
      });

      const imageId2 = workbook.addImage({
        base64: pngImg2,
        extension: 'png',
      });

      // Hoja solo con gráfica 1
      const grafica1Sheet = workbook.addWorksheet('Gráfica 1');
      grafica1Sheet.addRow(['Gráfica 1']);
      grafica1Sheet.getRow(1).height = 25;
      grafica1Sheet.getCell('A1').font = { bold: true };
      grafica1Sheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };
      grafica1Sheet.addImage(imageId1, {
        tl: { col: 0.2, row: 1.2 },
        ext: { width: 500, height: 300 }
      });
      formatSheet(grafica1Sheet);

      // Hoja solo con gráfica 2
      const grafica2Sheet = workbook.addWorksheet('Gráfica 2');
      grafica2Sheet.addRow(['Gráfica 2']);
      grafica2Sheet.getRow(1).height = 25;
      grafica2Sheet.getCell('A1').font = { bold: true };
      grafica2Sheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };
      grafica2Sheet.addImage(imageId2, {
        tl: { col: 0.2, row: 1.2 },
        ext: { width: 500, height: 300 }
      });
      formatSheet(grafica2Sheet);

    } catch (error) {
      console.error('Error al convertir SVG a PNG:', error);
      alert('Error al exportar las gráficas.');
    }
  }
  // --- Guardar archivo Excel ---
  workbook.xlsx.writeBuffer().then(data => {
    const blob = new Blob([data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    FileSaver.saveAs(blob, 'Simulacion de Cola de Impresoras.xlsx');
  });
}





}
