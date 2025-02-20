import { Component,  OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule, FormsModule ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  title = 'HLLBeat';
  rows: { colors: string[], glowing: boolean[] }[] = [];
  selectedBoxes: { rowIndex: number, index: number }[] = []; // Tıklanan kutuları tutacak
  isGlowingActive: boolean = false;
  glowInterval: any;
  BPM: number = 120;
  transitionTime: number = 15000/this.BPM;
  isSoundSelectorOpen = false;
  selectedRowIndex: number | null = null;
  availableSounds: string[] = [];

  constructor(private http: HttpClient) {
    this. addRow();
    this. addRow();
    this. addRow();
    this. addRow();
  }

  ngOnInit() {
    this.http.get<{ sounds: string[] }>('assets/sounds/soundList.json')
      .subscribe(data => {
        this.availableSounds = data.sounds.sort();// Alfabetik sıraya koy
      });
  }

  addRow() {
    if(this.rows.length<10){
    const newRow: { colors: string[], glowing: boolean[] } = { colors: [], glowing: [] }; 

    for (let i = 0; i < 18; i++) {
      if (i < 4 || (i >= 8 && i <= 11)) {
        newRow.colors.push('dark-box'); // İlk 4 ve 9-12 arasındaki kutular mavi
      } else {
        newRow.colors.push('light-box'); // Diğer kutular yeşil
      }
      newRow.glowing.push(false);
    }

    this.rows.push(newRow);
    /*this.startGlowEffect(this.rows.length - 1);*/
  }
  }

  stopContinuousGlow() {
    // Parlamayı durdur ve kutuları fading sınıfıyla kapat
    this.glowInterval && clearInterval(this.glowInterval);
    this.rows.forEach(row => {
      row.glowing.forEach((_, index) => {
        setTimeout(() => {
          // Fading sınıfını ekleyerek parıltıyı kapat
          row.glowing[index] = false;
        }, 5); // Geçişin yumuşak olması için 600ms gecikme
      });
    });
  }

  toggleGlowEffect() {
    if (this.isGlowingActive) {
      clearInterval(this.glowInterval);
      this.stopContinuousGlow();
    } else {
      this.startContinuousGlow();
    }
    this.isGlowingActive = !this.isGlowingActive;
  }

  startContinuousGlow() {
    let currentIndex = 0; // Parlayacak kutu sırası
    this.glowInterval = setInterval(() => {
      this.rows.forEach(row => {
        row.glowing.fill(false); // Önce tüm parlamaları kapat
        if (row.glowing[currentIndex] !== undefined) {
          row.glowing[currentIndex] = true;
        }
      });

      setTimeout(() => {
        this.rows.forEach((row, rowIndex) => {
          if (row.glowing[currentIndex] !== undefined) {
            row.glowing[currentIndex] = true;
  
            // 🔥 Eğer bu ilk satırsa, kick sesini çal
            //if (rowIndex === 0) {
              this.playSoundIfYellow(rowIndex, currentIndex, this.transitionTime);
            //}
          }
        });
      }, this.transitionTime);

      setTimeout(() => {
        this.rows.forEach(row => {
          if (row.glowing[currentIndex] !== undefined) {
            row.glowing[currentIndex] = false;
          }
        });
      }, this.transitionTime); // Parlama süresi

      currentIndex = (currentIndex + 1) % 16; // Sonraki kutuya geç
    }, this.transitionTime); // Her 200ms'de bir yeni kutuya geç
  }

  onTransitionTimeChange(newTime: number) {
    this.transitionTime = 15000/this.BPM; // Yeni süreyi güncelliyoruz
    if (this.isGlowingActive){
    this.stopContinuousGlow(); // Animasyonu durduruyoruz
    this.startContinuousGlow(); // Animasyonu yeniden başlatıyoruz
    }
  } 

  onBoxClick(rowIndex: number, index: number) {
    // Eğer son kutuya tıklanmışsa işlemi yapma, çünkü deleteRow fonksiyonu çalışacak
    if (index === 16) return;
    // Aynı kutuya tıklanırsa, bu kutuyu listeden çıkar
    const clickedBoxIndex = this.selectedBoxes.findIndex(
      (box) => box.rowIndex === rowIndex && box.index === index
    );

    if (clickedBoxIndex >= 0) {
      // Aynı kutuya tıklanınca, kutuyu listeden çıkar
      this.selectedBoxes.splice(clickedBoxIndex, 1);
    } else {
      // Farklı kutuya tıklanınca, yeni kutuyu ekle
      this.selectedBoxes.push({ rowIndex, index });
    }
  }

  deleteRow(rowIndex: number, event: Event) {
    event.stopPropagation(); // Çift tıklamayı önler

    // Satırı kaldır
    this.rows.splice(rowIndex, 1);

    // Seçili kutuları güncelle, silinen satırın kutularını çıkar ve aşağıdakileri kaydır
    this.selectedBoxes = this.selectedBoxes
      .filter(box => box.rowIndex !== rowIndex)
      .map(box => box.rowIndex > rowIndex ? { ...box, rowIndex: box.rowIndex - 1 } : box);
  }

  getBoxClass(rowIndex: number, index: number) {
    const isSelected = this.selectedBoxes.some(
      (box) => box.rowIndex === rowIndex && box.index === index
    );
  
    let classes = [];
  
    if (isSelected) {
      classes.push('selected'); // Seçili (sarı) kutular
    } else {
      classes.push(this.rows[rowIndex]?.colors[index] || ''); // Mavi veya yeşil kutuların rengi korunuyor
    }
  
    if (this.rows[rowIndex]?.glowing[index]) {
      if (isSelected) {
        classes.push('glowing'); // Sarı kutular tam parlama efekti alıyor
      } else {
        classes.push('non-selected-glowing'); // Mavi ve yeşil kutular sadece alt taraftan parlıyor
      }
    }
    return classes;
  }

playSoundIfYellow(rowIndex: number, index: number, delay: number = 0) {
  setTimeout(() => {
  // Güncellenmiş rowIndex'e göre sarı olup olmadığını kontrol et
  const isYellow = this.selectedBoxes.some(box => box.rowIndex === rowIndex && box.index === index);

 // if (isYellow && this.rowSounds[rowIndex]) {
  if (isYellow && this.rowSounds[rowIndex]) {
   // if (rowIndex <= this.soundPaths.length) {
      const audio = new Audio(`assets/sounds/${this.rowSounds[rowIndex]}`);
      //const audio = new Audio(this.soundPaths[rowIndex]);  
      audio.play();
    //}
  }
  }, delay);
}

// Her satırın seçilen sesi
rowSounds: { [key: number]: string } = {};

openSoundSelector(rowIndex: number) {
  this.selectedRowIndex = rowIndex;
  this.isSoundSelectorOpen = true;
}

closeSoundSelector() {
  this.isSoundSelectorOpen = false;
}

selectSound(rowIndex: number, sound: string) {
  //if (rowIndex === null) return;
  this.rowSounds[rowIndex] = sound;
  this.isSoundSelectorOpen = false;
}

playSoundPreview(sound: string) {
  const audio = new Audio(`assets/sounds/${sound}`);
  audio.play();
}







}
  