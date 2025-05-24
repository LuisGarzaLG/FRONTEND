import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SimulacionService {
  private baseUrl = 'http://localhost:5000/api';
  //private baseUrl = 'https://backend-6nsr.onrender.com/'

  constructor(private http: HttpClient) {}

  simular(parametros: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/simular`, parametros);
  }
}
