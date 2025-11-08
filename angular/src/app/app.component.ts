import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MapComponent } from './map/map.component';


import { HttpClientModule } from '@angular/common/http'; //
@Component({
  selector: 'app-root',
  imports: [HttpClientModule,RouterOutlet, MapComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'angular';


}
